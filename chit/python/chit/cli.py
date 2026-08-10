"""Chit CLI - compile and run Python code."""

import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from chit.core import Compiler


def main():
    if len(sys.argv) < 2:
        print("Usage: chit <command> <file>")
        print("Commands:")
        print("  compile <file.py>   Compile to native code")
        print("  run <file.py>       Compile and run")
        sys.exit(1)

    command = sys.argv[1]
    file = sys.argv[2] if len(sys.argv) > 2 else None

    if not file:
        print("Error: No file specified")
        sys.exit(1)

    if not os.path.exists(file):
        print(f"Error: File not found: {file}")
        sys.exit(1)

    compiler = Compiler()

    with open(file, "r") as f:
        source = f.read()

    if command == "compile":
        code = compiler.compile(source)
        out_file = file.removesuffix(".py") + ".native"
        with open(out_file, "wb") as f:
            f.write(code)
        print(f"Compiled: {file} -> {out_file}")

    elif command == "run":
        code = compiler.compile(source)
        result = compiler.execute(code)
        print(f"Result: {result}")

    else:
        print(f"Unknown command: {command}")
        sys.exit(1)


if __name__ == "__main__":
    main()
