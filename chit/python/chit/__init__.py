"""
Chit — Generic JIT compiler with pluggable backends and native ops.

Architecture follows pugqeep pattern:
  - Backend (ABC): compile IR → native code (Cranelift, LLVM, C fallback)
  - Op (ABC): pluggable native operation (matmul, rmsnorm, softmax, etc.)
  - OpsRegistry: register ops by name
  - Compiler: compose backend + ops → compile functions → execute

Usage:
    from chit import Compiler, OpsRegistry
    from chit.ops import MatMulOp, RMSNormOp

    registry = OpsRegistry()
    registry.register(MatMulOp())
    registry.register(RMSNormOp())

    compiler = Compiler(backend="c", ops=registry)
    fn = compiler.compile(\"\"\"
        h = rmsnorm(x, weight, eps)
        q = matmul(h, W_q)
    \"\"\")

    result = fn(x=np.zeros(896), weight=np.ones(896), W_q=np.random.randn(896,896))
"""

from .core import Compiler
from .registry import OpsRegistry, Op
from .backends import CBackend, Backend
from .decorators import jit

__version__ = "0.2.0"

__all__ = [
    "Compiler",
    "OpsRegistry",
    "Op",
    "Backend",
    "CBackend",
    "jit",
]
