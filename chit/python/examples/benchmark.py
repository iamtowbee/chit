"""Chit benchmark - compare Python vs native."""

import time
from chit import Compiler


def benchmark_python(n):
    """Pure Python benchmark."""
    start = time.perf_counter()
    total = 0
    for i in range(n):
        total += i * i
    end = time.perf_counter()
    return (end - start) * 1000


def benchmark_native(n):
    """Native benchmark via Chit."""
    compiler = Compiler()
    start = time.perf_counter()
    for i in range(n):
        code = compiler.compile(f"{i}*{i}")
        compiler.execute(code)
    end = time.perf_counter()
    return (end - start) * 1000


print("Chit Benchmark")
print("=" * 40)

for n in [100, 500, 1000]:
    py_time = benchmark_python(n)
    native_time = benchmark_native(n)
    speedup = py_time / native_time if native_time > 0 else 0
    print(f"n={n}:")
    print(f"  Python:  {py_time:.3f}ms")
    print(f"  Native:  {native_time:.3f}ms")
    print(f"  Speedup: {speedup:.1f}x")
