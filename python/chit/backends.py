"""
Chit pluggable backends — Backend ABC + CBackend.

Follows pugqeep's StorageBackend pattern.
Each backend compiles Chit IR to native code.
"""

from __future__ import annotations

import ctypes
import ctypes.util
import os
import platform
import subprocess
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Dict, List, Optional, Tuple

import numpy as np

# dlclose for cleanup on macOS/Linux
try:
    _dlclose = ctypes.cdll.LoadLibrary("").dlclose
    _dlclose.argtypes = [ctypes.c_void_p]
    _dlclose.restype = ctypes.c_int
except Exception:
    def _dlclose(handle):
        pass


class Backend(ABC):
    """Base class for JIT compilation backends.

    Subclass this to add new backends (Cranelift, LLVM, etc).
    Each backend has a unique name and compiles IR to native code.
    """

    name: str = "base"

    @abstractmethod
    def compile_ir(self, ir: 'IRFunction') -> bytes:
        """Compile IR to native machine code bytes."""
        ...

    @abstractmethod
    def execute(self, code: bytes, args: Dict[str, np.ndarray]) -> np.ndarray:
        """Execute compiled code with given arguments."""
        ...

    def __repr__(self) -> str:
        return f"Backend({self.name!r})"


class CBackend(Backend):
    """C fallback backend — compiles via gcc/clang, loads as .dylib.

    This is the simplest backend: generates C source from IR,
    compiles with -O3, loads via ctypes.
    """

    name = "c"

    def __init__(self, compiler: str = "cc", flags: Optional[List[str]] = None):
        self._compiler = compiler
        self._flags = flags or ["-O3", "-march=native", "-shared", "-fPIC"]
        self._tmp_dir = Path(os.environ.get("TMPDIR", "/tmp")) / "chit"
        self._tmp_dir.mkdir(parents=True, exist_ok=True)

    def compile_ir(self, ir: 'IRFunction') -> bytes:
        """Compile IR to C source, then to native .dylib."""
        c_source = self._ir_to_c(ir)
        return self._compile_c(c_source)

    def execute(self, code: bytes, args: Dict[str, np.ndarray],
                param_order: Optional[List[str]] = None) -> np.ndarray:
        """Load .dylib and call entry function."""
        uid = uuid.uuid4().hex[:8]
        dylib_path = self._tmp_dir / f"chit_{uid}.dylib"
        dylib_path.write_bytes(code)

        lib = ctypes.CDLL(str(dylib_path))

        # Build arg list — use param_order if given (matches C function signature)
        c_args = []
        if param_order:
            for name in param_order:
                if name in args:
                    c_args.append(args[name].ctypes.data_as(ctypes.POINTER(ctypes.c_float)))
                else:
                    raise ValueError(f"Missing required arg: {name}")
        else:
            for name, arr in args.items():
                c_args.append(arr.ctypes.data_as(ctypes.POINTER(ctypes.c_float)))

        # Call entry function
        lib.chit_entry.restype = ctypes.POINTER(ctypes.c_float)
        lib.chit_entry.argtypes = [ctypes.POINTER(ctypes.c_float)] * len(c_args)

        result_ptr = lib.chit_entry(*c_args)

        if not result_ptr:
            raise RuntimeError("chit_entry returned NULL")

        # Determine output size — use the largest input array
        max_n = max(arr.size for arr in args.values())
        result = np.ctypeslib.as_array(result_ptr, shape=(max_n,)).copy()

        # Cleanup
        try:
            _dlclose(lib._handle)
        except Exception:
            pass

        return result

    def _ir_to_c(self, ir: 'IRFunction') -> str:
        """Generate C source from IR."""
        lines = ['#include <math.h>', '#include <string.h>', '']

        # Single function
        args_str = ', '.join(f'float* {p}' for p in ir.params)
        lines.append(f'float* {ir.name}({args_str}) {{')

        # Static output buffer (survives function return)
        lines.append(f'    static float _chit_result[256];')

        # Local variables
        for var in ir.locals:
            lines.append(f'    float {var}[256];')

        # Generate instructions
        for inst in ir.instructions:
            lines.extend(self._gen_instruction(inst))

        # Copy last result to static buffer and return
        if ir.instructions:
            last_dst = ir.instructions[-1].dst
            lines.append(f'    memcpy(_chit_result, {last_dst}, sizeof(float) * 256);')
            lines.append(f'    return _chit_result;')
        else:
            lines.append('    return NULL;')

        lines.append('}')

        return '\n'.join(lines)

    def _gen_function(self, func: 'IRFunction') -> List[str]:
        """Generate C code for a single function."""
        args_str = ', '.join(f'float* {p}' for p in func.params)
        lines = [f'float* {func.name}({args_str}) {{']

        # Local variables
        for var in func.locals:
            lines.append(f'    float {var}[256];')

        # Generate instructions
        for inst in func.instructions:
            lines.extend(self._gen_instruction(inst))

        lines.append('    return NULL;')
        lines.append('}')
        return lines

    def _gen_instruction(self, inst: 'IRInst') -> List[str]:
        """Generate C code for a single IR instruction."""
        lines = []
        op = inst.op

        if op == 'matmul':
            # out = matmul(a, b, M, N, K)
            lines.append(f'    // matmul {inst.dst} = {inst.src_a} @ {inst.src_b}')
            lines.append(f'    {{')
            lines.append(f'        int M = {inst.args.get("M", "1")};')
            lines.append(f'        int N = {inst.args.get("N", "1")};')
            lines.append(f'        int K = {inst.args.get("K", "1")};')
            lines.append(f'        for (int i = 0; i < M; i++) {{')
            lines.append(f'            for (int j = 0; j < N; j++) {{')
            lines.append(f'                float sum = 0.0f;')
            lines.append(f'                for (int k = 0; k < K; k++) {{')
            lines.append(f'                    sum += {inst.src_a}[i*K+k] * {inst.src_b}[j*K+k];')
            lines.append(f'                }}')
            lines.append(f'                {inst.dst}[i*N+j] = sum;')
            lines.append(f'            }}')
            lines.append(f'        }}')
            lines.append(f'    }}')

        elif op == 'rmsnorm':
            lines.append(f'    // rmsnorm {inst.dst} = rmsnorm({inst.src_a}, {inst.src_b})')
            lines.append(f'    {{')
            lines.append(f'        int n = {inst.args.get("n", "1")};')
            lines.append(f'        float eps = {inst.args.get("eps", "1e-5f")};')
            lines.append(f'        float sum = 0.0f;')
            lines.append(f'        for (int i = 0; i < n; i++) sum += {inst.src_a}[i] * {inst.src_a}[i];')
            lines.append(f'        float rms = sqrtf(sum / n + eps);')
            lines.append(f'        for (int i = 0; i < n; i++) {inst.dst}[i] = {inst.src_a}[i] / rms * {inst.src_b}[i];')
            lines.append(f'    }}')

        elif op == 'silu':
            lines.append(f'    // silu {inst.dst} = silu({inst.src_a})')
            lines.append(f'    {{')
            lines.append(f'        int n = {inst.args.get("n", "1")};')
            lines.append(f'        for (int i = 0; i < n; i++) {{')
            lines.append(f'            float _val = {inst.src_a}[i];')
            lines.append(f'            {inst.dst}[i] = _val / (1.0f + expf(-_val));')
            lines.append(f'        }}')
            lines.append(f'    }}')

        elif op == 'add_residual':
            lines.append(f'    // add_residual {inst.dst} = {inst.src_a} + {inst.src_b}')
            lines.append(f'    {{')
            lines.append(f'        int n = {inst.args.get("n", "1")};')
            lines.append(f'        for (int i = 0; i < n; i++) {inst.dst}[i] = {inst.src_a}[i] + {inst.src_b}[i];')
            lines.append(f'    }}')

        elif op == 'argmax':
            lines.append(f'    // argmax {inst.dst} = argmax({inst.src_a})')
            lines.append(f'    {{')
            lines.append(f'        int n = {inst.args.get("n", "1")};')
            lines.append(f'        int best = 0;')
            lines.append(f'        for (int i = 1; i < n; i++) {{')
            lines.append(f'            if ({inst.src_a}[i] > {inst.src_a}[best]) best = i;')
            lines.append(f'        }}')
            lines.append(f'        {inst.dst}[0] = (float)best;')
            lines.append(f'    }}')

        elif op == 'softmax':
            lines.append(f'    // softmax {inst.dst} = softmax({inst.src_a})')
            lines.append(f'    {{')
            lines.append(f'        int rows = {inst.args.get("rows", "1")};')
            lines.append(f'        int cols = {inst.args.get("cols", "1")};')
            lines.append(f'        for (int r = 0; r < rows; r++) {{')
            lines.append(f'            float _max = {inst.src_a}[r*cols];')
            lines.append(f'            for (int c = 1; c < cols; c++) {{')
            lines.append(f'                float _v = {inst.src_a}[r*cols+c];')
            lines.append(f'                if (_v > _max) _max = _v;')
            lines.append(f'            }}')
            lines.append(f'            float _sum = 0.0f;')
            lines.append(f'            for (int c = 0; c < cols; c++) {{')
            lines.append(f'                {inst.dst}[r*cols+c] = expf({inst.src_a}[r*cols+c] - _max);')
            lines.append(f'                _sum += {inst.dst}[r*cols+c];')
            lines.append(f'            }}')
            lines.append(f'            for (int c = 0; c < cols; c++) {{')
            lines.append(f'                {inst.dst}[r*cols+c] /= _sum;')
            lines.append(f'            }}')
            lines.append(f'        }}')
            lines.append(f'    }}')

        elif op == 'embed':
            lines.append(f'    // embed {inst.dst} = embed({inst.src_a}, {inst.src_b})')
            lines.append(f'    memcpy({inst.dst}, {inst.src_a} + ((int){inst.src_b}[0]) * {inst.args.get("D", "1")}, {inst.args.get("D", "1")} * sizeof(float));')

        elif op == 'alloc':
            lines.append(f'    // alloc {inst.dst}[{inst.args.get("n", "256")}]')
            # Already handled in locals

        elif op == 'rope':
            lines.append(f'    // rope {inst.dst} = rope({inst.src_a})')
            lines.append(f'    {{')
            lines.append(f'        int n = {inst.args.get("n", "1")};')
            lines.append(f'        int head_dim = {inst.args.get("head_dim", "64")};')
            lines.append(f'        int pos = (int){inst.args.get("pos", "0")};')
            lines.append(f'        float base = {inst.args.get("base", "10000.0f")};')
            lines.append(f'        for (int h = 0; h < n / head_dim; h++) {{')
            lines.append(f'            for (int d = 0; d < head_dim; d += 2) {{')
            lines.append(f'                float freq = 1.0f / powf(base, (float)d / head_dim);')
            lines.append(f'                float theta = (float)pos * freq;')
            lines.append(f'                float cos_t = cosf(theta);')
            lines.append(f'                float sin_t = sinf(theta);')
            lines.append(f'                int idx = h * head_dim + d;')
            lines.append(f'                float x0 = {inst.src_a}[idx];')
            lines.append(f'                float x1 = {inst.src_a}[idx+1];')
            lines.append(f'                {inst.dst}[idx] = x0 * cos_t - x1 * sin_t;')
            lines.append(f'                {inst.dst}[idx+1] = x0 * sin_t + x1 * cos_t;')
            lines.append(f'            }}')
            lines.append(f'        }}')
            lines.append(f'    }}')

        elif op == 'copy':
            lines.append(f'    memcpy({inst.dst}, {inst.src_a}, {inst.args.get("n", "1")} * sizeof(float));')

        return lines

    def _compile_c(self, c_source: str) -> bytes:
        """Compile C source to .dylib, return bytes."""
        src_path = self._tmp_dir / "chit_gen.c"
        out_path = self._tmp_dir / "chit_gen.dylib"

        src_path.write_text(c_source)

        cmd = [self._compiler] + self._flags + ["-o", str(out_path), str(src_path)]
        if platform.system() == "Darwin":
            cmd.extend(["-framework", "Accelerate"])

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode != 0:
            raise RuntimeError(f"C compilation failed:\n{result.stderr}")

        return out_path.read_bytes()


# ══════════════════════════════════════════════════════════════════════════════
# IR types
# ══════════════════════════════════════════════════════════════════════════════

@dataclass
class IRInst:
    """Single IR instruction."""
    op: str
    dst: str
    src_a: str = ""
    src_b: str = ""
    args: Dict[str, Any] = None

    def __post_init__(self):
        if self.args is None:
            self.args = {}


@dataclass
class IRFunction:
    """IR function with params, locals, and instructions."""
    name: str
    params: List[str]
    locals: List[str]
    instructions: List[IRInst]
