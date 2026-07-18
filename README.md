# Chit

JIT compiler built with Rust and C++.

## Build

```bash
make all
```

## Usage

```python
from chit import jit

@jit
def add(a, b):
    return a + b

print(add(10, 20))
```

## Structure

- `rust/` - Rust backend (Cranelift)
- `cpp/` - C++ backend (LLVM)
- `python/` - Python bindings
