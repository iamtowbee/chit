"""Chit example - compile and run."""

from chit import jit, Compiler


# Example 1: Basic compilation
print("Example 1: Basic compilation")
compiler = Compiler()
code = compiler.compile("42")
result = compiler.execute(code)
print(f"  compile('42') = {result}")

# Example 2: Arithmetic
print("\nExample 2: Arithmetic")
expressions = [
    "10+20",
    "7*8",
    "100-50",
    "100/5",
    "2+3*4",
    "10*2+5",
    "100-3*10",
]
for expr in expressions:
    code = compiler.compile(expr)
    result = compiler.execute(code)
    print(f"  {expr} = {result}")

# Example 3: JIT decorator
print("\nExample 3: JIT decorator")

@jit
def add(a, b):
    return a + b

@jit
def multiply(a, b):
    return a * b

print(f"  add(10, 20) = {add(10, 20)}")
print(f"  multiply(7, 8) = {multiply(7, 8)}")
