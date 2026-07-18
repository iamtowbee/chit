use crate::ir::{Constant, Function, Instruction, Value};

pub fn optimize(function: &mut Function) {
    let mut changed = true;
    let mut iterations = 0;
    while changed && iterations < 100 {
        changed = false;
        changed |= constant_folding(function);
        changed |= dead_code_elimination(function);
        iterations += 1;
    }
}

fn constant_folding(function: &mut Function) -> bool {
    let mut changed = false;
    for (inst_id, inst) in function.instructions.iter().enumerate() {
        match inst {
            Instruction::Add(a, b) | Instruction::Sub(a, b) | Instruction::Mul(a, b) => {
                if let (Some(Value::Constant(Constant::I64(va))), Some(Value::Constant(Constant::I64(vb)))) =
                    (function.values.get(a.0 as usize), function.values.get(b.0 as usize))
                {
                    let result = match inst {
                        Instruction::Add(_, _) => va + vb,
                        Instruction::Sub(_, _) => va - vb,
                        Instruction::Mul(_, _) => va * vb,
                        _ => unreachable!(),
                    };
                    function.values[inst_id] = Value::Constant(Constant::I64(result));
                    changed = true;
                }
            }
            _ => {}
        }
    }
    changed
}

fn dead_code_elimination(function: &mut Function) -> bool {
    let mut changed = false;
    for block in &mut function.blocks {
        let original_len = block.instructions.len();
        block.instructions.retain(|inst_id| {
            function.instructions.get(inst_id.0 as usize)
                .map_or(false, |inst| matches!(inst, Instruction::Jump(_) | Instruction::Branch { .. } | Instruction::Return(_)))
        });
        if block.instructions.len() != original_len {
            changed = true;
        }
    }
    changed
}
