"""
Chit decorators — JIT compilation with pluggable backends.

Usage:
    from chit import jit

    @jit
    def relu(x, n):
        for i in range(n):
            if x[i] < 0:
                x[i] = 0
        return x

    # Or with explicit compiler:
    from chit import Compiler
    compiler = Compiler(backend="c")
"""

import functools
from .core import Compiler


def jit(func=None, *, backend="c", ops=None):
    """JIT compile a function to native machine code.

    Can be used as @jit or @jit(backend="c").
    """

    def decorator(f):
        # For now, the @jit decorator is a pass-through.
        # Full Python → IR compilation requires a Python parser,
        # which is a separate module (chit.python_parser).
        #
        # Use Compiler.compile() directly for the IR-based API:
        #   compiler = Compiler()
        #   fn = compiler.compile("h = rmsnorm(x, w)")
        #   result = fn(x=data, w=weights)

        @functools.wraps(f)
        def wrapper(*args, **kwargs):
            return f(*args, **kwargs)

        wrapper._compiler = Compiler(backend=backend, ops=ops) if ops else None
        wrapper._original = f
        return wrapper

    if func is not None:
        return decorator(func)
    return decorator
