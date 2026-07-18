"""Chit tests — pluggable JIT compiler with native ops."""

import pytest
import numpy as np


# ══════════════════════════════════════════════════════════════════════════════
# Core API
# ══════════════════════════════════════════════════════════════════════════════

def test_compiler_create():
    from chit import Compiler
    compiler = Compiler()
    assert compiler is not None
    assert compiler._backend.name == "c"


def test_compiler_with_custom_ops():
    from chit import Compiler, OpsRegistry
    from chit.ops import MatMulOp
    registry = OpsRegistry()
    registry.register(MatMulOp())
    compiler = Compiler(ops=registry, auto_register_builtins=False)
    assert "matmul" in compiler._ops


# ══════════════════════════════════════════════════════════════════════════════
# OpsRegistry
# ══════════════════════════════════════════════════════════════════════════════

def test_registry_register():
    from chit import OpsRegistry
    from chit.ops import MatMulOp
    r = OpsRegistry()
    r.register(MatMulOp())
    assert "matmul" in r
    assert r.get("matmul") is not None


def test_registry_list():
    from chit import OpsRegistry
    from chit.ops import BUILTIN_OPS
    r = OpsRegistry()
    for op in BUILTIN_OPS:
        r.register(op)
    names = r.list()
    assert "matmul" in names
    assert "rmsnorm" in names
    assert "silu" in names
    assert "argmax" in names
    assert "embed" in names
    assert "softmax" in names
    assert "rope" in names
    assert "copy" in names
    assert "add_residual" in names


def test_registry_get_missing():
    from chit import OpsRegistry
    r = OpsRegistry()
    assert r.get("nonexistent") is None


# ══════════════════════════════════════════════════════════════════════════════
# Ops — numpy dispatch (reference implementations)
# ══════════════════════════════════════════════════════════════════════════════

def test_matmul_numpy():
    from chit.ops import MatMulOp
    op = MatMulOp()
    A = np.array([[1, 2, 3, 4]], dtype=np.float32)
    B = np.ones((2, 4), dtype=np.float32) * 0.5
    out = np.zeros((1, 2), dtype=np.float32)
    op.numpy_dispatch(out, A, B.flatten(), 1, 2, 4)
    expected = A @ B.T
    np.testing.assert_allclose(out.flatten(), expected.flatten(), atol=1e-6)


def test_rmsnorm_numpy():
    from chit.ops import RMSNormOp
    op = RMSNormOp()
    x = np.array([1.0, 2.0, 3.0, 4.0], dtype=np.float32)
    w = np.ones(4, dtype=np.float32)
    out = np.zeros(4, dtype=np.float32)
    op.numpy_dispatch(out, x, w, 4, 1e-5)
    rms = np.sqrt(np.mean(x ** 2) + 1e-5)
    expected = x / rms * w
    np.testing.assert_allclose(out, expected, atol=1e-5)


def test_silu_numpy():
    from chit.ops import SiLUOp
    op = SiLUOp()
    x = np.array([-1.0, 0.0, 1.0, 2.0], dtype=np.float32)
    out = np.zeros(4, dtype=np.float32)
    op.numpy_dispatch(out, x, 4)
    expected = x / (1.0 + np.exp(-x))
    np.testing.assert_allclose(out, expected, atol=1e-6)


def test_argmax_numpy():
    from chit.ops import ArgMaxOp
    op = ArgMaxOp()
    logits = np.array([1.0, 5.0, 3.0, 2.0], dtype=np.float32)
    out = np.zeros(1, dtype=np.float32)
    op.numpy_dispatch(out, logits, 4)
    assert out[0] == 1.0  # index of max


def test_softmax_numpy():
    from chit.ops import SoftmaxOp
    op = SoftmaxOp()
    x = np.array([1.0, 2.0, 3.0], dtype=np.float32)
    out = np.zeros(3, dtype=np.float32)
    op.numpy_dispatch(out, x, 1, 3)
    expected = np.exp(x) / np.exp(x).sum()
    np.testing.assert_allclose(out, expected, atol=1e-5)


def test_add_residual_numpy():
    from chit.ops import AddResidualOp
    op = AddResidualOp()
    out = np.array([1.0, 2.0, 3.0], dtype=np.float32)
    res = np.array([0.5, 0.5, 0.5], dtype=np.float32)
    op.numpy_dispatch(out, res, 3)
    np.testing.assert_allclose(out, [1.5, 2.5, 3.5], atol=1e-6)


def test_embed_numpy():
    from chit.ops import EmbedOp
    op = EmbedOp()
    emb = np.arange(12, dtype=np.float32).reshape(3, 4)
    token_id = np.array([1.0], dtype=np.float32)
    out = np.zeros(4, dtype=np.float32)
    op.numpy_dispatch(out, emb.flatten(), token_id[0], 4)
    np.testing.assert_allclose(out, [4, 5, 6, 7], atol=1e-6)


# ══════════════════════════════════════════════════════════════════════════════
# Compiler — IR parsing
# ══════════════════════════════════════════════════════════════════════════════

def test_parse_matmul():
    from chit import Compiler
    c = Compiler()
    ir = c._parse("out = matmul(x, W, 1, 4, 8)")
    assert len(ir.instructions) == 1
    assert ir.instructions[0].op == "matmul"
    assert ir.instructions[0].dst == "out"
    assert ir.instructions[0].src_a == "x"
    assert ir.instructions[0].src_b == "W"
    assert ir.instructions[0].args["M"] == 1
    assert ir.instructions[0].args["N"] == 4
    assert ir.instructions[0].args["K"] == 8
    assert "x" in ir.params
    assert "W" in ir.params
    assert "out" in ir.locals


def test_parse_multiline():
    from chit import Compiler
    c = Compiler()
    ir = c._parse("""
        out = matmul(x, W, 1, 4, 8)
        normed = rmsnorm(out, weight, 4, 1e-5)
        result = silu(normed, 4)
    """)
    assert len(ir.instructions) == 3
    assert ir.instructions[0].op == "matmul"
    assert ir.instructions[1].op == "rmsnorm"
    assert ir.instructions[2].op == "silu"


def test_parse_comments():
    from chit import Compiler
    c = Compiler()
    ir = c._parse("""
        # This is a comment
        out = matmul(x, W, 1, 4, 8)
    """)
    assert len(ir.instructions) == 1


# ══════════════════════════════════════════════════════════════════════════════
# End-to-end — compile + execute
# ══════════════════════════════════════════════════════════════════════════════

def test_matmul_e2e():
    from chit import Compiler
    c = Compiler()
    fn = c.compile("out = matmul(x, W, 1, 4, 8)")

    x = np.array([1, 2, 3, 4, 5, 6, 7, 8], dtype=np.float32)
    W = np.ones((4, 8), dtype=np.float32)
    result = fn(x=x, W=W)

    expected = x @ W.T
    np.testing.assert_allclose(result[:4], expected, atol=1e-5)


def test_matmul_rmsnorm_silu_e2e():
    from chit import Compiler
    c = Compiler()
    fn = c.compile("""
        out = matmul(x, W, 1, 4, 8)
        normed = rmsnorm(out, weight, 4, 1e-5)
        result = silu(normed, 4)
    """)

    x = np.arange(8, dtype=np.float32)
    W = np.ones((4, 8), dtype=np.float32) * 0.1
    weight = np.ones(4, dtype=np.float32)
    result = fn(x=x, W=W, weight=weight)

    # Verify against numpy
    out_np = x @ W.T
    normed_np = out_np / np.sqrt(np.mean(out_np ** 2) + 1e-5) * weight
    expected = normed_np / (1.0 + np.exp(-normed_np))
    np.testing.assert_allclose(result[:4], expected, atol=1e-5)


def test_argmax_e2e():
    from chit import Compiler
    c = Compiler()
    fn = c.compile("result = argmax(logits, 4)")

    logits = np.array([1.0, 5.0, 3.0, 2.0], dtype=np.float32)
    result = fn(logits=logits)
    assert result[0] == 1.0


def test_copy_e2e():
    from chit import Compiler
    c = Compiler()
    fn = c.compile("result = copy(src, 4)")

    src = np.array([10.0, 20.0, 30.0, 40.0], dtype=np.float32)
    result = fn(src=src)
    np.testing.assert_allclose(result[:4], src, atol=1e-6)


def test_softmax_e2e():
    from chit import Compiler
    c = Compiler()
    fn = c.compile("result = softmax(x, 1, 4)")

    x = np.array([1.0, 2.0, 3.0, 4.0], dtype=np.float32)
    result = fn(x=x)
    expected = np.exp(x) / np.exp(x).sum()
    np.testing.assert_allclose(result[:4], expected, atol=1e-5)


# ══════════════════════════════════════════════════════════════════════════════
# Transformer block (mini)
# ══════════════════════════════════════════════════════════════════════════════

def test_transformer_block_e2e():
    """Simulate a single transformer block: norm → matmul → silu → matmul → residual."""
    from chit import Compiler
    c = Compiler()
    fn = c.compile("""
        normed = rmsnorm(x, norm_w, 8, 1e-5)
        h1 = matmul(normed, W1, 1, 4, 8)
        act = silu(h1, 4)
        h2 = matmul(act, W2, 1, 8, 4)
        result = add_residual(h2, x, 8)
    """)

    D, FF = 8, 4
    x = np.random.randn(D).astype(np.float32)
    norm_w = np.ones(D, dtype=np.float32)
    W1 = np.random.randn(FF, D).astype(np.float32) * 0.1
    W2 = np.random.randn(D, FF).astype(np.float32) * 0.1

    result = fn(x=x, norm_w=norm_w, W1=W1, W2=W2)

    # Verify against numpy
    normed = x / np.sqrt(np.mean(x ** 2) + 1e-5) * norm_w
    h1 = normed @ W1.T
    act = h1 / (1.0 + np.exp(-h1))
    h2 = act @ W2.T
    expected = h2 + x
    np.testing.assert_allclose(result[:D], expected, atol=1e-4)


# ══════════════════════════════════════════════════════════════════════════════
# Backward compatibility — @jit decorator
# ══════════════════════════════════════════════════════════════════════════════

def test_jit_decorator():
    from chit import jit

    @jit
    def add(a, b):
        return a + b

    assert add(1, 2) == 3
