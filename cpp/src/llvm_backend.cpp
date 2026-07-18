#include "chit/llvm_backend.h"
#include <cstring>
#include <cstdlib>
#include <vector>
#include <cstdint>

enum Opcode : uint8_t {
    OP_CONST=0, OP_ADD=1, OP_SUB=2, OP_MUL=3, OP_DIV=4, OP_MOD=5,
    OP_LOAD_VAR=10, OP_STORE_VAR=11,
    OP_CMP_EQ=20, OP_CMP_NE=21, OP_CMP_LT=22, OP_CMP_LE=23, OP_CMP_GT=24, OP_CMP_GE=25,
    OP_AND=30, OP_OR=31, OP_NOT=32,
    OP_JMP=40, OP_JZ=41, OP_JNZ=42,
    OP_RET=50
};

struct IRInst { uint8_t opcode, dst, src1, src2; int64_t imm; };
struct IRFunction { std::vector<IRInst> instructions; };

static int64_t var_store[256];

static void optimize(IRFunction& f) {
    int64_t regs[64] = {};
    bool known[64] = {};
    memset(var_store, 0, sizeof(var_store));
    std::vector<IRInst> out;

    for (auto& inst : f.instructions) {
        switch (inst.opcode) {
            case OP_CONST:
                regs[inst.dst] = inst.imm;
                known[inst.dst] = true;
                out.push_back(inst);
                break;
            case OP_ADD: case OP_SUB: case OP_MUL: case OP_DIV: case OP_MOD: {
                if (known[inst.src1] && known[inst.src2]) {
                    int64_t r = 0;
                    if (inst.opcode == OP_ADD) r = regs[inst.src1] + regs[inst.src2];
                    else if (inst.opcode == OP_SUB) r = regs[inst.src1] - regs[inst.src2];
                    else if (inst.opcode == OP_MUL) r = regs[inst.src1] * regs[inst.src2];
                    else if (inst.opcode == OP_DIV) r = regs[inst.src2] ? regs[inst.src1] / regs[inst.src2] : 0;
                    else if (inst.opcode == OP_MOD) r = regs[inst.src2] ? regs[inst.src1] % regs[inst.src2] : 0;
                    regs[inst.dst] = r;
                    known[inst.dst] = true;
                    out.push_back({OP_CONST, inst.dst, 0, 0, r});
                } else {
                    known[inst.dst] = false;
                    out.push_back(inst);
                }
                break;
            }
            case OP_STORE_VAR:
                // Don't track var values - they change in loops
                out.push_back(inst);
                break;
            case OP_LOAD_VAR: {
                // Don't constant-fold - vars change at runtime
                known[inst.dst] = false;
                out.push_back(inst);
                break;
            }
            case OP_CMP_EQ: case OP_CMP_NE: case OP_CMP_LT: case OP_CMP_LE: case OP_CMP_GT: case OP_CMP_GE: {
                if (known[inst.src1] && known[inst.src2]) {
                    int64_t r = 0;
                    switch (inst.opcode) {
                        case OP_CMP_EQ: r = (regs[inst.src1] == regs[inst.src2]); break;
                        case OP_CMP_NE: r = (regs[inst.src1] != regs[inst.src2]); break;
                        case OP_CMP_LT: r = (regs[inst.src1] < regs[inst.src2]); break;
                        case OP_CMP_LE: r = (regs[inst.src1] <= regs[inst.src2]); break;
                        case OP_CMP_GT: r = (regs[inst.src1] > regs[inst.src2]); break;
                        case OP_CMP_GE: r = (regs[inst.src1] >= regs[inst.src2]); break;
                        default: break;
                    }
                    regs[inst.dst] = r;
                    known[inst.dst] = true;
                    out.push_back({OP_CONST, inst.dst, 0, 0, r});
                } else {
                    known[inst.dst] = false;
                    out.push_back(inst);
                }
                break;
            }
            case OP_AND: case OP_OR: case OP_NOT: {
                if (inst.opcode == OP_NOT) {
                    if (known[inst.src1]) {
                        int64_t r = !regs[inst.src1];
                        regs[inst.dst] = r;
                        known[inst.dst] = true;
                        out.push_back({OP_CONST, inst.dst, 0, 0, r});
                    } else {
                        known[inst.dst] = false;
                        out.push_back(inst);
                    }
                } else {
                    if (known[inst.src1] && known[inst.src2]) {
                        int64_t r = (inst.opcode == OP_AND) ? (regs[inst.src1] && regs[inst.src2]) : (regs[inst.src1] || regs[inst.src2]);
                        regs[inst.dst] = r;
                        known[inst.dst] = true;
                        out.push_back({OP_CONST, inst.dst, 0, 0, r});
                    } else {
                        known[inst.dst] = false;
                        out.push_back(inst);
                    }
                }
                break;
            }
            case OP_JMP: case OP_JZ: case OP_JNZ:
            case OP_RET:
                out.push_back(inst);
                break;
            default:
                out.push_back(inst);
                break;
        }
    }

    // Skip DCE - it invalidates jump targets
    f.instructions = out;
}

// x86_64 register assignments: EAX=0, ECX=1, EDX=2, EBX=3
static const uint8_t x86_modrm[4] = { 0xC0, 0xC8, 0xD0, 0xD8 };

static size_t codegen(const IRFunction& f, uint8_t* buf) {
    size_t pos = 0;
    uint8_t reg_map[64] = {};
    bool reg_assigned[64] = {};
    uint8_t next_x86 = 0;

    // Two-pass: first compute sizes, then emit with resolved jumps
    std::vector<size_t> inst_offsets(f.instructions.size());
    std::vector<size_t> inst_sizes(f.instructions.size());

    // First pass: compute each instruction's size
    for (size_t i = 0; i < f.instructions.size(); i++) {
        auto& inst = f.instructions[i];
        size_t sz = 0;
        switch (inst.opcode) {
            case OP_CONST: sz = 5; break; // MOV reg, imm32
            case OP_ADD: case OP_SUB: sz = 4; break; // MOV(2) + ADD/SUB(2)
            case OP_MUL: sz = 5; break; // MOV(2) + IMUL(3)
            case OP_DIV: case OP_MOD: sz = 5; break; // MOV + CDQ + IDIV [+ MOV]
            case OP_LOAD_VAR: sz = 7; break; // REX + MOV rd, [RDI+disp32]
            case OP_STORE_VAR: sz = 7; break; // REX + MOV [RDI+disp32], rs
            case OP_RET: sz = (reg_map[inst.src1] == 0) ? 1 : 3; break; // [MOV EAX,] RET
            case OP_JMP: sz = 5; break; // JMP rel32
            case OP_JZ: sz = 8; break; // TEST(2) + JZ rel32(6)
            case OP_JNZ: sz = 8; break;
            case OP_CMP_EQ: case OP_CMP_NE: case OP_CMP_LT: case OP_CMP_LE: case OP_CMP_GT: case OP_CMP_GE:
                sz = 8; break; // CMP(2) + SETcc(3) + MOVZX(3)
            default: sz = 1; break;
        }
        inst_sizes[i] = sz;

        // Update reg_map - assign fixed x86 register per IR register
        if (!reg_assigned[inst.dst]) {
            if (inst.opcode == OP_CONST || inst.opcode == OP_LOAD_VAR) {
                reg_map[inst.dst] = next_x86 % 4;
                next_x86++;
                reg_assigned[inst.dst] = true;
            } else if (inst.opcode == OP_ADD || inst.opcode == OP_SUB || inst.opcode == OP_MUL) {
                reg_map[inst.dst] = next_x86 % 4;
                next_x86++;
                reg_assigned[inst.dst] = true;
            } else if (inst.opcode == OP_DIV || inst.opcode == OP_MOD) {
                reg_map[inst.dst] = (inst.opcode == OP_DIV) ? 0 : 2;
                next_x86++;
                reg_assigned[inst.dst] = true;
            } else if (inst.opcode == OP_CMP_EQ || inst.opcode == OP_CMP_NE ||
                       inst.opcode == OP_CMP_LT || inst.opcode == OP_CMP_LE ||
                       inst.opcode == OP_CMP_GT || inst.opcode == OP_CMP_GE) {
                reg_map[inst.dst] = next_x86 % 4;
                next_x86++;
                reg_assigned[inst.dst] = true;
            }
        }
    }

    // Compute offsets
    size_t total = 0;
    for (size_t i = 0; i < f.instructions.size(); i++) {
        inst_offsets[i] = total;
        total += inst_sizes[i];
    }

    // Save reg_map from first pass
    uint8_t saved_reg_map[64];
    memcpy(saved_reg_map, reg_map, sizeof(reg_map));

    // Second pass: emit code
    pos = 0;
    memcpy(reg_map, saved_reg_map, sizeof(reg_map));

    for (size_t i = 0; i < f.instructions.size(); i++) {
        auto& inst = f.instructions[i];
        switch (inst.opcode) {
            case OP_CONST: {
                uint8_t r = reg_map[inst.dst];
                // MOV r, imm32
                buf[pos++] = 0xB8 + r;
                buf[pos++] = inst.imm & 0xFF;
                buf[pos++] = (inst.imm >> 8) & 0xFF;
                buf[pos++] = (inst.imm >> 16) & 0xFF;
                buf[pos++] = (inst.imm >> 24) & 0xFF;
                break;
            }
            case OP_ADD: {
                uint8_t r0 = reg_map[inst.src1];
                uint8_t r1 = reg_map[inst.src2];
                uint8_t rd = reg_map[inst.dst];
                buf[pos++] = 0x89; buf[pos++] = x86_modrm[r0] | rd; // MOV rd, r0
                buf[pos++] = 0x01; buf[pos++] = x86_modrm[r1] | rd; // ADD rd, r1
                break;
            }
            case OP_SUB: {
                uint8_t r0 = reg_map[inst.src1];
                uint8_t r1 = reg_map[inst.src2];
                uint8_t rd = reg_map[inst.dst];
                buf[pos++] = 0x89; buf[pos++] = x86_modrm[r0] | rd;
                buf[pos++] = 0x29; buf[pos++] = x86_modrm[r1] | rd;
                break;
            }
            case OP_MUL: {
                uint8_t r0 = reg_map[inst.src1];
                uint8_t r1 = reg_map[inst.src2];
                uint8_t rd = reg_map[inst.dst];
                buf[pos++] = 0x89; buf[pos++] = x86_modrm[r0] | rd; // MOV rd, r0
                // IMUL rd, r1: reg=rd(dest), r/m=r1(source)
                buf[pos++] = 0x0F; buf[pos++] = 0xAF; buf[pos++] = x86_modrm[rd] | r1;
                break;
            }
            case OP_DIV: {
                uint8_t r0 = reg_map[inst.src1];
                uint8_t r1 = reg_map[inst.src2];
                buf[pos++] = 0x89; buf[pos++] = x86_modrm[r0] | 0;
                buf[pos++] = 0x99; // CDQ
                // IDIV r1: opcode F7 /7, ModRM = mod=3, reg=7(ext), r/m=r1
                buf[pos++] = 0xF7; buf[pos++] = 0xF8 | r1;
                break;
            }
            case OP_MOD: {
                uint8_t r0 = reg_map[inst.src1];
                uint8_t r1 = reg_map[inst.src2];
                buf[pos++] = 0x89; buf[pos++] = x86_modrm[r0] | 0;
                buf[pos++] = 0x99;
                buf[pos++] = 0xF7; buf[pos++] = 0xF8 | r1;
                buf[pos++] = 0x89; buf[pos++] = x86_modrm[2] | reg_map[inst.dst];
                break;
            }
            case OP_LOAD_VAR: {
                uint8_t rd = reg_map[inst.dst];
                int32_t offset = (int32_t)(inst.imm & 0xFF) * 8;
                // MOV rd, [RDI + disp32]
                buf[pos++] = 0x48 | (rd >= 8 ? 4 : 0);
                buf[pos++] = 0x8B;
                buf[pos++] = 0x87 | ((rd & 7) << 3); // mod=10, reg=rd, r/m=111(RDI)
                buf[pos++] = offset & 0xFF;
                buf[pos++] = (offset >> 8) & 0xFF;
                buf[pos++] = (offset >> 16) & 0xFF;
                buf[pos++] = (offset >> 24) & 0xFF;
                break;
            }
            case OP_STORE_VAR: {
                uint8_t rs = reg_map[inst.src1];
                int32_t offset = (int32_t)(inst.imm & 0xFF) * 8;
                // MOV [RDI + disp32], rs
                buf[pos++] = 0x48 | (rs >= 8 ? 4 : 0);
                buf[pos++] = 0x89;
                buf[pos++] = 0x87 | ((rs & 7) << 3); // mod=10, reg=rs, r/m=111(RDI)
                buf[pos++] = offset & 0xFF;
                buf[pos++] = (offset >> 8) & 0xFF;
                buf[pos++] = (offset >> 16) & 0xFF;
                buf[pos++] = (offset >> 24) & 0xFF;
                break;
            }
            case OP_RET: {
                uint8_t r0 = reg_map[inst.src1];
                if (r0 != 0) {
                    buf[pos++] = 0x89; buf[pos++] = x86_modrm[r0] | 0;
                }
                buf[pos++] = 0xC3;
                break;
            }
            case OP_JMP: {
                // JMP rel32
                buf[pos++] = 0xE9;
                int32_t offset = (int32_t)(inst_offsets[(size_t)inst.imm] - pos - 4);
                buf[pos++] = offset & 0xFF;
                buf[pos++] = (offset >> 8) & 0xFF;
                buf[pos++] = (offset >> 16) & 0xFF;
                buf[pos++] = (offset >> 24) & 0xFF;
                break;
            }
            case OP_JZ: {
                // TEST reg, reg; JZ rel32
                uint8_t r0 = reg_map[inst.src1];
                buf[pos++] = 0x85; buf[pos++] = x86_modrm[r0] | r0; // TEST r0, r0
                buf[pos++] = 0x0F; buf[pos++] = 0x84; // JZ rel32
                int32_t offset = (int32_t)(inst_offsets[(size_t)inst.imm] - pos - 4);
                buf[pos++] = offset & 0xFF;
                buf[pos++] = (offset >> 8) & 0xFF;
                buf[pos++] = (offset >> 16) & 0xFF;
                buf[pos++] = (offset >> 24) & 0xFF;
                break;
            }
            case OP_JNZ: {
                uint8_t r0 = reg_map[inst.src1];
                buf[pos++] = 0x85; buf[pos++] = x86_modrm[r0] | r0;
                buf[pos++] = 0x0F; buf[pos++] = 0x85; // JNZ rel32
                int32_t offset = (int32_t)(inst_offsets[(size_t)inst.imm] - pos - 4);
                buf[pos++] = offset & 0xFF;
                buf[pos++] = (offset >> 8) & 0xFF;
                buf[pos++] = (offset >> 16) & 0xFF;
                buf[pos++] = (offset >> 24) & 0xFF;
                break;
            }
            case OP_CMP_EQ: case OP_CMP_NE: case OP_CMP_LT: case OP_CMP_LE: case OP_CMP_GT: case OP_CMP_GE: {
                uint8_t r0 = reg_map[inst.src1];
                uint8_t r1 = reg_map[inst.src2];
                uint8_t rd = reg_map[inst.dst];
                // CMP r0, r1
                buf[pos++] = 0x39;
                buf[pos++] = x86_modrm[r1] | r0;
                // SETcc AL
                uint8_t setcc;
                switch (inst.opcode) {
                    case OP_CMP_EQ: setcc = 0x94; break;
                    case OP_CMP_NE: setcc = 0x95; break;
                    case OP_CMP_LT: setcc = 0x9C; break;
                    case OP_CMP_LE: setcc = 0x9E; break;
                    case OP_CMP_GT: setcc = 0x9F; break;
                    case OP_CMP_GE: setcc = 0x9D; break;
                    default: setcc = 0x94; break;
                }
                buf[pos++] = 0x0F;
                buf[pos++] = setcc;
                buf[pos++] = 0xC0; // AL
                // MOVZX rd, AL
                buf[pos++] = 0x0F;
                buf[pos++] = 0xB6;
                buf[pos++] = x86_modrm[0] | rd;
                break;
            }
            default:
                buf[pos++] = 0x90; // NOP
                break;
        }
    }

    return pos;
}

// ---- Parser ----
static const char* sp;
static uint8_t next_reg = 0;

static IRFunction parse_expr();
static IRFunction parse_primary();
static IRFunction parse_mul_div();
static IRFunction parse_add_sub();
static IRFunction parse_comparison();
static IRFunction parse_and_or();
static IRFunction parse_assignment();
static IRFunction parse_stmt();

static void skip() { while (*sp == ' ' || *sp == '\t') sp++; }

static int64_t parse_num() {
    int64_t v = 0;
    while (*sp >= '0' && *sp <= '9') { v = v * 10 + (*sp - '0'); sp++; }
    return v;
}

static int parse_var() {
    if ((*sp >= 'a' && *sp <= 'z') || (*sp >= 'A' && *sp <= 'Z')) {
        return *sp++;
    }
    return -1;
}

static IRFunction parse_primary() {
    IRFunction f;
    skip();
    if (*sp >= '0' && *sp <= '9') {
        int64_t v = parse_num();
        uint8_t r = next_reg++;
        f.instructions.push_back({OP_CONST, r, 0, 0, v});
        return f;
    }
    int v = parse_var();
    if (v >= 0) {
        uint8_t r = next_reg++;
        f.instructions.push_back({OP_LOAD_VAR, r, 0, 0, (int64_t)v});
        return f;
    }
    if (*sp == '(') {
        sp++;
        IRFunction inner = parse_expr();
        skip();
        if (*sp == ')') sp++;
        return inner;
    }
    uint8_t r = next_reg++;
    f.instructions.push_back({OP_CONST, r, 0, 0, 0});
    return f;
}

static IRFunction parse_mul_div() {
    IRFunction left = parse_primary();
    skip();
    while (*sp == '*' || *sp == '/' || *sp == '%') {
        char op = *sp++;
        IRFunction right = parse_primary();
        skip();
        uint8_t lr = left.instructions.back().dst;
        uint8_t rr = right.instructions.back().dst;
        uint8_t res = next_reg++;
        uint8_t alu = (op == '*') ? OP_MUL : (op == '/') ? OP_DIV : OP_MOD;
        left.instructions.insert(left.instructions.end(), right.instructions.begin(), right.instructions.end());
        left.instructions.push_back({alu, res, lr, rr, 0});
    }
    return left;
}

static IRFunction parse_add_sub() {
    IRFunction left = parse_mul_div();
    skip();
    while (*sp == '+' || *sp == '-') {
        char op = *sp++;
        IRFunction right = parse_mul_div();
        skip();
        uint8_t lr = left.instructions.back().dst;
        uint8_t rr = right.instructions.back().dst;
        uint8_t res = next_reg++;
        left.instructions.insert(left.instructions.end(), right.instructions.begin(), right.instructions.end());
        left.instructions.push_back({(op == '+') ? OP_ADD : OP_SUB, res, lr, rr, 0});
    }
    return left;
}

static IRFunction parse_comparison() {
    IRFunction left = parse_add_sub();
    skip();
    while ((*sp == '=' && *(sp+1) == '=') || (*sp == '!' && *(sp+1) == '=') ||
           (*sp == '<' && *(sp+1) == '=') || (*sp == '>' && *(sp+1) == '=') ||
           (*sp == '<' || *sp == '>')) {
        char op1 = *sp; char op2 = *(sp+1);
        uint8_t alu;
        if (op1 == '=' && op2 == '=') { alu = OP_CMP_EQ; sp += 2; }
        else if (op1 == '!' && op2 == '=') { alu = OP_CMP_NE; sp += 2; }
        else if (op1 == '<' && op2 == '=') { alu = OP_CMP_LE; sp += 2; }
        else if (op1 == '>' && op2 == '=') { alu = OP_CMP_GE; sp += 2; }
        else if (op1 == '<') { alu = OP_CMP_LT; sp += 1; }
        else if (op1 == '>') { alu = OP_CMP_GT; sp += 1; }
        else break;
        IRFunction right = parse_add_sub();
        skip();
        uint8_t lr = left.instructions.back().dst;
        uint8_t rr = right.instructions.back().dst;
        uint8_t res = next_reg++;
        left.instructions.insert(left.instructions.end(), right.instructions.begin(), right.instructions.end());
        left.instructions.push_back({alu, res, lr, rr, 0});
    }
    return left;
}

static IRFunction parse_and_or() {
    IRFunction left = parse_comparison();
    skip();
    while ((*sp == '&' && *(sp+1) == '&') || (*sp == '|' && *(sp+1) == '|')) {
        char op1 = *sp; sp += 2; skip();
        IRFunction right = parse_comparison();
        skip();
        uint8_t lr = left.instructions.back().dst;
        uint8_t rr = right.instructions.back().dst;
        uint8_t res = next_reg++;
        uint8_t alu = (op1 == '&') ? OP_AND : OP_OR;
        left.instructions.insert(left.instructions.end(), right.instructions.begin(), right.instructions.end());
        left.instructions.push_back({alu, res, lr, rr, 0});
    }
    return left;
}

static IRFunction parse_assignment() {
    IRFunction f;
    skip();
    int var = parse_var();
    if (var >= 0) {
        skip();
        if (*sp == '=') {
            sp++;
            skip();
            IRFunction val = parse_and_or();
            uint8_t vr = val.instructions.back().dst;
            f.instructions.insert(f.instructions.end(), val.instructions.begin(), val.instructions.end());
            f.instructions.push_back({OP_STORE_VAR, vr, vr, 0, (int64_t)var});
            return f;
        }
        sp--;
    }
    return parse_and_or();
}

static IRFunction parse_stmt();

static IRFunction parse_if() {
    IRFunction f;
    sp += 2; // skip "if"
    skip();
    IRFunction cond = parse_and_or();
    skip();
    if (*sp == ':') sp++;
    skip();
    IRFunction body = parse_stmt();
    uint8_t cr = cond.instructions.back().dst;
    uint8_t result_reg = next_reg++;
    f.instructions.push_back({OP_CONST, result_reg, 0, 0, 0});
    f.instructions.insert(f.instructions.end(), cond.instructions.begin(), cond.instructions.end());
    size_t jz_idx = f.instructions.size();
    f.instructions.push_back({OP_JZ, 0, cr, 0, 0});
    f.instructions.insert(f.instructions.end(), body.instructions.begin(), body.instructions.end());
    f.instructions.push_back({OP_CONST, result_reg, 0, 0, 1});

    // Handle elif/else chains
    while (true) {
        skip();
        if (*sp == 'e' && *(sp+1) == 'l' && *(sp+2) == 'i' && *(sp+3) == 'f') {
            sp += 4; // skip "elif"
            skip();
            IRFunction elif_cond = parse_and_or();
            skip();
            if (*sp == ':') sp++;
            skip();
            IRFunction elif_body = parse_stmt();
            // Patch previous JZ to jump here
            f.instructions[jz_idx].imm = (int64_t)f.instructions.size();
            uint8_t ecr = elif_cond.instructions.back().dst;
            f.instructions.insert(f.instructions.end(), elif_cond.instructions.begin(), elif_cond.instructions.end());
            jz_idx = f.instructions.size();
            f.instructions.push_back({OP_JZ, 0, ecr, 0, 0});
            f.instructions.insert(f.instructions.end(), elif_body.instructions.begin(), elif_body.instructions.end());
            f.instructions.push_back({OP_CONST, result_reg, 0, 0, 1});
        } else if (*sp == 'e' && *(sp+1) == 'l' && *(sp+2) == 's' && *(sp+3) == 'e') {
            sp += 4; // skip "else"
            skip();
            if (*sp == ':') sp++;
            skip();
            IRFunction else_body = parse_stmt();
            f.instructions[jz_idx].imm = (int64_t)f.instructions.size();
            f.instructions.insert(f.instructions.end(), else_body.instructions.begin(), else_body.instructions.end());
            break;
        } else {
            break;
        }
    }

    f.instructions[jz_idx].imm = (int64_t)f.instructions.size();
    return f;
}

static IRFunction parse_while() {
    IRFunction f;
    sp += 5; // skip "while"
    skip();
    IRFunction cond = parse_and_or();
    skip();
    if (*sp == ':') sp++;
    skip();
    IRFunction body = parse_stmt();
    uint8_t cr = cond.instructions.back().dst;
    f.instructions.insert(f.instructions.end(), cond.instructions.begin(), cond.instructions.end());
    size_t jz_idx = f.instructions.size();
    f.instructions.push_back({OP_JZ, 0, cr, 0, 0}); // placeholder
    f.instructions.insert(f.instructions.end(), body.instructions.begin(), body.instructions.end());
    f.instructions.push_back({OP_JMP, 0, 0, 0, 0}); // placeholder, imm = cond_start
    // Store metadata: jz_idx and jmp_idx for the caller to patch
    f.instructions[jz_idx].imm = (int64_t)f.instructions.size(); // JZ target = end (past JMP)
    f.instructions.back().imm = 0; // JMP target = start of cond (index 0 in f)
    return f;
}

static IRFunction parse_stmt() {
    skip();
    if (*sp == 'i' && *(sp+1) == 'f') {
        return parse_if();
    }
    if (*sp == 'w' && *(sp+1) == 'h' && *(sp+2) == 'i' && *(sp+3) == 'l' && *(sp+4) == 'e') {
        return parse_while();
    }
    IRFunction f = parse_assignment();
    skip();
    while (*sp == ';') {
        sp++;
        skip();
        IRFunction next = parse_stmt();
        size_t offset = f.instructions.size();
        f.instructions.insert(f.instructions.end(), next.instructions.begin(), next.instructions.end());
        // Patch any JMP/JZ targets that are relative to the sub-function
        for (size_t i = offset; i < f.instructions.size(); i++) {
            auto& inst = f.instructions[i];
            if (inst.opcode == OP_JMP || inst.opcode == OP_JZ || inst.opcode == OP_JNZ) {
                inst.imm += offset;
            }
        }
        skip();
    }
    return f;
}

static IRFunction parse_expr() {
    next_reg = 0;
    IRFunction f = parse_stmt();
    uint8_t ret_reg = 0;
    for (auto& i : f.instructions) {
        if (i.opcode == OP_CONST || i.opcode == OP_ADD || i.opcode == OP_SUB ||
            i.opcode == OP_MUL || i.opcode == OP_DIV || i.opcode == OP_MOD ||
            i.opcode == OP_LOAD_VAR || (i.opcode >= OP_CMP_EQ && i.opcode <= OP_CMP_GE) ||
            i.opcode == OP_AND || i.opcode == OP_OR || i.opcode == OP_NOT) {
            ret_reg = i.dst;
        }
    }
    f.instructions.push_back({OP_RET, 0, ret_reg, 0, 0});
    return f;
}

struct ChitLLVM { int opt; };

extern "C" {

ChitLLVM* chit_llvm_create() { return new ChitLLVM{3}; }
void chit_llvm_destroy(ChitLLVM* c) { delete c; }

const uint8_t* chit_llvm_compile(ChitLLVM* c, const char* src, size_t* out_size) {
    if (!c || !src) return nullptr;
    sp = src;
    IRFunction func = parse_expr();
    if (c->opt >= 1) optimize(func);
    uint8_t* code = (uint8_t*)malloc(4096);
    *out_size = codegen(func, code);
    return code;
}

}
