"""
Chit pluggable registry — Op ABC + OpsRegistry.

Follows pugqeep's CompressionStrategy/FunctionType pattern.
Each Op is a pluggable native operation with a C implementation.
"""

from __future__ import annotations

import ctypes
import os
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Tuple


class Op(ABC):
    """Base class for pluggable native operations.

    Subclass this to add new operations (matmul, rmsnorm, softmax, etc).
    Each op has a unique name and a C function pointer.
    """

    name: str = "base"

    @abstractmethod
    def c_signature(self) -> Tuple[str, List[str], str]:
        """Return (c_func_name, arg_types, return_type).

        Returns:
            Tuple of:
            - c_func_name: symbol name in the shared library
            - arg_types: list of ctypes type names ('float*', 'int', etc)
            - return_type: ctypes type name ('void', 'float', etc)
        """
        ...

    @abstractmethod
    def numpy_dispatch(self, *args, **kwargs) -> Any:
        """Pure-numpy fallback when C library is unavailable.

        This is the reference implementation. The C version should
        produce identical results.
        """
        ...

    def __repr__(self) -> str:
        return f"Op({self.name!r})"


@dataclass
class OpInfo:
    """Resolved op with C function pointer."""
    op: Op
    c_func: Optional[Callable] = None
    has_c: bool = False


class OpsRegistry:
    """Registry of pluggable native operations.

    Follows pugqeep's _CompressorRegistry pattern:
    - register(op) — add an op
    - get(name) — look up by name
    - list() — all registered names
    - resolve(lib) — bind ops to C function pointers from a loaded library
    """

    def __init__(self):
        self._ops: Dict[str, Op] = {}
        self._resolved: Dict[str, OpInfo] = {}

    def register(self, op: Op) -> None:
        """Register a native operation."""
        self._ops[op.name] = op
        # Invalidate resolution cache
        self._resolved.pop(op.name, None)

    def get(self, name: str) -> Optional[Op]:
        """Get an op by name."""
        return self._ops.get(name)

    def list(self) -> List[str]:
        """List registered op names."""
        return list(self._ops.keys())

    def __contains__(self, name: str) -> bool:
        return name in self._ops

    def resolve(self, lib: ctypes.CDLL) -> Dict[str, OpInfo]:
        """Bind all registered ops to C function pointers.

        Args:
            lib: loaded shared library containing C implementations.

        Returns:
            Dict of name → OpInfo with resolved C function pointers.
        """
        self._resolved.clear()
        for name, op in self._ops.items():
            c_name, arg_types, ret_type = op.c_signature()
            c_func = None
            has_c = False

            if hasattr(lib, c_name):
                try:
                    c_func = getattr(lib, c_name)
                    c_func.argtypes = self._resolve_arg_types(arg_types)
                    c_func.restype = self._resolve_ret_type(ret_type)
                    has_c = True
                except Exception:
                    c_func = None

            self._resolved[name] = OpInfo(op=op, c_func=c_func, has_c=has_c)

        return self._resolved

    def get_resolved(self, name: str) -> Optional[OpInfo]:
        """Get resolved op info (call resolve() first)."""
        return self._resolved.get(name)

    @staticmethod
    def _resolve_arg_types(types: List[str]) -> List[Any]:
        """Convert string type names to ctypes types."""
        mapping = {
            'float': ctypes.c_float,
            'float*': ctypes.POINTER(ctypes.c_float),
            'int': ctypes.c_int,
            'int64': ctypes.c_int64,
            'int8': ctypes.c_int8,
            'int8*': ctypes.POINTER(ctypes.c_int8),
            'void': None,
            'size_t': ctypes.c_size_t,
        }
        return [mapping.get(t, ctypes.c_void_p) for t in types]

    @staticmethod
    def _resolve_ret_type(t: str):
        """Convert string type name to ctypes type."""
        mapping = {
            'float': ctypes.c_float,
            'int': ctypes.c_int,
            'void': None,
            'size_t': ctypes.c_size_t,
        }
        return mapping.get(t, ctypes.c_void_p)
