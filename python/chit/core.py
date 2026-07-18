"""
Chit Compiler — facade that composes backend + ops.

Follows pugqeep's PGQGeneric pattern:
  Compiler(backend="c", ops=registry)
  → compile(source) → native code
  → execute(code, args) → result

The compiler:
1. Parses Python-like source into IR (IRFunction)
2. Resolves op calls to registered native ops
3. Compiles IR via the chosen backend
4. Returns executable code
"""

from __future__ import annotations

import ctypes
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

import numpy as np

from .registry import OpsRegistry, Op, OpInfo
from .backends import Backend, CBackend, IRFunction, IRInst
from .ops import BUILTIN_OPS

logger = logging.getLogger("chit.compiler")


class Compiler:
    """Generic JIT compiler with pluggable backends and ops.

    Args:
        backend: Backend instance or name ("c" for C fallback).
        ops: OpsRegistry instance or None (uses builtins).
        auto_register_builtins: Register all built-in ops automatically.

    Usage:
        compiler = Compiler()
        fn = compiler.compile(\"\"\"
            h = rmsnorm(x, weight)
            q = matmul(h, W_q)
            next_id = argmax(q)
        \"\"\")
        result = fn(x=np.zeros(896), weight=np.ones(896), W_q=np.random.randn(896,896))
    """

    def __init__(
        self,
        backend: Union[str, Backend] = "c",
        ops: Optional[OpsRegistry] = None,
        auto_register_builtins: bool = True,
    ):
        # Resolve backend
        if isinstance(backend, str):
            if backend == "c":
                self._backend = CBackend()
            else:
                raise ValueError(f"Unknown backend '{backend}'. Available: ['c']")
        else:
            self._backend = backend

        # Resolve ops
        if ops is None:
            self._ops = OpsRegistry()
        elif isinstance(ops, OpsRegistry):
            self._ops = ops
        else:
            raise TypeError(f"ops must be OpsRegistry or None, got {type(ops)}")

        # Register built-in ops
        if auto_register_builtins:
            for op in BUILTIN_OPS:
                if op.name not in self._ops:
                    self._ops.register(op)

        # Cache compiled code
        self._cache: Dict[str, bytes] = {}

    def compile(self, source: str) -> 'CompiledFunction':
        """Compile Python-like source to executable function.

        Args:
            source: Multi-line source with op calls like:
                h = rmsnorm(x, weight)
                q = matmul(h, W_q)

        Returns:
            CompiledFunction that can be called with numpy arrays.
        """
        # Parse source into IR
        ir = self._parse(source)

        # Check cache
        cache_key = self._ir_hash(ir)
        if cache_key in self._cache:
            logger.debug("chit: cache hit for %s", cache_key[:8])

        # Compile via backend
        native_code = self._backend.compile_ir(ir)

        # Create executable wrapper
        return CompiledFunction(
            code=native_code,
            ir=ir,
            backend=self._backend,
            ops=self._ops,
        )

    def _parse(self, source: str) -> IRFunction:
        """Parse source into IR.

        Simple line-based parser:
            var = op(arg1, arg2, ...)
            var = op(arg1, arg2, key=val)
        """
        instructions = []
        params = set()
        locals_used = set()

        # Positional arg names per op (first two are always src_a, src_b)
        _OP_POSITIONAL = {
            'matmul': ['src_a', 'src_b', 'M', 'N', 'K'],
            'rmsnorm': ['src_a', 'src_b', 'n', 'eps'],
            'silu': ['src_a', 'n'],
            'add_residual': ['src_a', 'src_b', 'n'],
            'embed': ['src_a', 'src_b', 'D'],
            'argmax': ['src_a', 'n'],
            'rope': ['src_a', 'n', 'head_dim', 'pos', 'base'],
            'softmax': ['src_a', 'rows', 'cols'],
            'copy': ['src_a', 'n'],
        }

        for line in source.strip().split('\n'):
            line = line.strip()
            if not line or line.startswith('#'):
                continue

            # Parse: dst = op(src_a, src_b, ...)
            if '=' in line:
                dst, rhs = line.split('=', 1)
                dst = dst.strip()
                rhs = rhs.strip()

                # Parse op call
                if '(' in rhs and rhs.endswith(')'):
                    op_name = rhs[:rhs.index('(')]
                    args_str = rhs[rhs.index('(') + 1:-1]
                    raw_args = self._parse_args(args_str)

                    # Map positional args to named params
                    positional_names = _OP_POSITIONAL.get(op_name, [])
                    args = {}
                    for k, v in raw_args.items():
                        if k.isdigit() and int(k) < len(positional_names):
                            args[positional_names[int(k)]] = v
                        else:
                            args[k] = v
                else:
                    # Assignment: dst = src
                    op_name = 'copy'
                    args = {'src_a': rhs}

                # Identify params (inputs) vs locals
                src_vars = [v for v in args.values() if isinstance(v, str) and v.isidentifier()]
                for sv in src_vars:
                    if sv not in locals_used and sv != dst:
                        params.add(sv)

                locals_used.add(dst)

                # Build IR instruction
                inst = IRInst(
                    op=op_name,
                    dst=dst,
                    src_a=args.get('src_a', ''),
                    src_b=args.get('src_b', ''),
                    args={k: v for k, v in args.items() if k not in ('src_a', 'src_b')},
                )
                instructions.append(inst)

        return IRFunction(
            name="chit_entry",
            params=sorted(params),
            locals=sorted(locals_used - params),
            instructions=instructions,
        )

    def _parse_args(self, args_str: str) -> Dict[str, Any]:
        """Parse comma-separated arguments."""
        args = {}
        if not args_str.strip():
            return args

        parts = self._split_args(args_str)
        positional = 0
        for part in parts:
            part = part.strip()
            if '=' in part:
                k, v = part.split('=', 1)
                args[k.strip()] = self._parse_value(v.strip())
            else:
                args[str(positional)] = self._parse_value(part)
                positional += 1

        return args

    @staticmethod
    def _split_args(s: str) -> List[str]:
        """Split on commas, respecting nested parens."""
        parts = []
        depth = 0
        current = []
        for c in s:
            if c == '(':
                depth += 1
                current.append(c)
            elif c == ')':
                depth -= 1
                current.append(c)
            elif c == ',' and depth == 0:
                parts.append(''.join(current))
                current = []
            else:
                current.append(c)
        if current:
            parts.append(''.join(current))
        return parts

    @staticmethod
    def _parse_value(s: str) -> Any:
        """Parse a value: number, string, or variable name."""
        s = s.strip()
        try:
            return int(s)
        except ValueError:
            try:
                return float(s)
            except ValueError:
                return s  # variable name

    @staticmethod
    def _ir_hash(ir: IRFunction) -> str:
        """Simple hash of IR for caching."""
        parts = [ir.name]
        for inst in ir.instructions:
            parts.append(f"{inst.op}:{inst.dst}:{inst.src_a}:{inst.src_b}")
        return hash('|'.join(parts)) & 0xFFFFFFFF


class CompiledFunction:
    """A compiled function ready to execute."""

    def __init__(
        self,
        code: bytes,
        ir: IRFunction,
        backend: Backend,
        ops: OpsRegistry,
    ):
        self._code = code
        self._ir = ir
        self._backend = backend
        self._ops = ops

    def __call__(self, **kwargs) -> np.ndarray:
        """Execute with named numpy array arguments."""
        return self._backend.execute(self._code, kwargs, param_order=self._ir.params)

    @property
    def ir(self) -> IRFunction:
        """The IR for this function."""
        return self._ir

    @property
    def native_size(self) -> int:
        """Size of compiled native code in bytes."""
        return len(self._code)
