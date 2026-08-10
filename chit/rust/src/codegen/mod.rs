use crate::ir::{Function, Instruction, Value, Constant};

pub trait CodeGenBackend {
    fn compile(&self, function: &Function) -> Result<Vec<u8>, CodeGenError>;
    fn name(&self) -> &str;
}

#[derive(Debug)]
pub enum CodeGenError {
    CompileError(String),
}

pub struct X86_64Backend;

impl X86_64Backend {
    pub fn new() -> Self { Self }

    fn emit_mov_rax_imm(&self, buf: &mut Vec<u8>, val: i64) {
        buf.extend_from_slice(&[0x48, 0xB8]);
        buf.extend_from_slice(&val.to_ne_bytes());
    }

    fn emit_add_rax(&self, buf: &mut Vec<u8>, val: i64) {
        buf.extend_from_slice(&[0x48, 0x83, 0xC0]);
        buf.push(val as i32 as u8);
    }

    fn emit_sub_rax(&self, buf: &mut Vec<u8>, val: i64) {
        buf.extend_from_slice(&[0x48, 0x83, 0xE8]);
        buf.push(val as i32 as u8);
    }

    fn emit_mul_rax(&self, buf: &mut Vec<u8>, val: i64) {
        buf.extend_from_slice(&[0x48, 0x69, 0xC0]);
        buf.extend_from_slice(&(val as i32).to_ne_bytes());
    }

    fn emit_ret(&self, buf: &mut Vec<u8>) {
        buf.push(0xC3);
    }
}

impl CodeGenBackend for X86_64Backend {
    fn compile(&self, function: &Function) -> Result<Vec<u8>, CodeGenError> {
        let mut code = Vec::new();

        for block_id in &function.block_order {
            if let Some(block) = function.blocks.iter().find(|b| b.id == *block_id) {
                for inst_id in &block.instructions {
                    if let Some(inst) = function.instructions.get(inst_id.0 as usize) {
                        match inst {
                            Instruction::Return(val_id) => {
                                if let Some(Value::Constant(c)) = function.values.get(val_id.0 as usize) {
                                    match c {
                                        Constant::I64(v) => self.emit_mov_rax_imm(&mut code, *v),
                                        Constant::I32(v) => self.emit_mov_rax_imm(&mut code, *v as i64),
                                        _ => {}
                                    }
                                }
                                self.emit_ret(&mut code);
                            }
                            Instruction::Add(a, b) => {
                                if let (Some(Value::Constant(ca)), Some(Value::Constant(cb))) =
                                    (function.values.get(a.0 as usize), function.values.get(b.0 as usize))
                                {
                                    if let (Constant::I64(va), Constant::I64(vb)) = (ca, cb) {
                                        self.emit_mov_rax_imm(&mut code, *va);
                                        self.emit_add_rax(&mut code, *vb);
                                    }
                                }
                            }
                            Instruction::Sub(a, b) => {
                                if let (Some(Value::Constant(ca)), Some(Value::Constant(cb))) =
                                    (function.values.get(a.0 as usize), function.values.get(b.0 as usize))
                                {
                                    if let (Constant::I64(va), Constant::I64(vb)) = (ca, cb) {
                                        self.emit_mov_rax_imm(&mut code, *va);
                                        self.emit_sub_rax(&mut code, *vb);
                                    }
                                }
                            }
                            Instruction::Mul(a, b) => {
                                if let (Some(Value::Constant(ca)), Some(Value::Constant(cb))) =
                                    (function.values.get(a.0 as usize), function.values.get(b.0 as usize))
                                {
                                    if let (Constant::I64(va), Constant::I64(vb)) = (ca, cb) {
                                        self.emit_mov_rax_imm(&mut code, *va);
                                        self.emit_mul_rax(&mut code, *vb);
                                    }
                                }
                            }
                            _ => {}
                        }
                    }
                }
            }
        }

        if code.is_empty() {
            self.emit_mov_rax_imm(&mut code, 0);
            self.emit_ret(&mut code);
        }

        Ok(code)
    }

    fn name(&self) -> &str { "x86_64" }
}

pub struct JitCompiler {
    backend: Box<dyn CodeGenBackend>,
}

impl JitCompiler {
    pub fn new() -> Self {
        Self {
            backend: Box::new(X86_64Backend::new()),
        }
    }

    pub fn compile(&self, function: &Function) -> Result<Vec<u8>, CodeGenError> {
        self.backend.compile(function)
    }
}

impl Default for JitCompiler {
    fn default() -> Self { Self::new() }
}
