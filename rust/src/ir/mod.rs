use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct ValueId(pub u32);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct BlockId(pub u32);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct FunctionId(pub u32);

#[derive(Debug, Clone)]
pub enum Value {
    Constant(Constant),
    Argument { index: usize },
    Instruction { inst_id: InstructionId },
}

#[derive(Debug, Clone)]
pub enum Constant {
    I8(i8),
    I16(i16),
    I32(i32),
    I64(i64),
    F32(f32),
    F64(f64),
    Bool(bool),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct InstructionId(pub u32);

#[derive(Debug, Clone)]
pub enum Instruction {
    Add(ValueId, ValueId),
    Sub(ValueId, ValueId),
    Mul(ValueId, ValueId),
    Div(ValueId, ValueId),
    Rem(ValueId, ValueId),
    Neg(ValueId),
    FAdd(ValueId, ValueId),
    FSub(ValueId, ValueId),
    FMul(ValueId, ValueId),
    FDiv(ValueId, ValueId),
    FNeg(ValueId),
    Eq(ValueId, ValueId),
    Ne(ValueId, ValueId),
    Lt(ValueId, ValueId),
    Le(ValueId, ValueId),
    Gt(ValueId, ValueId),
    Ge(ValueId, ValueId),
    And(ValueId, ValueId),
    Or(ValueId, ValueId),
    Xor(ValueId, ValueId),
    Not(ValueId),
    Jump(BlockId),
    Branch { condition: ValueId, true_block: BlockId, false_block: BlockId },
    Return(ValueId),
    Load { address: ValueId },
    Store { address: ValueId, value: ValueId },
    Call { args: Vec<ValueId> },
}

#[derive(Debug, Clone)]
pub struct Block {
    pub id: BlockId,
    pub instructions: Vec<InstructionId>,
    pub predecessors: Vec<BlockId>,
    pub successors: Vec<BlockId>,
}

#[derive(Debug, Clone)]
pub struct Function {
    pub id: FunctionId,
    pub name: String,
    pub params: Vec<String>,
    pub blocks: Vec<Block>,
    pub values: Vec<Value>,
    pub instructions: Vec<Instruction>,
    pub block_order: Vec<BlockId>,
    next_value_id: u32,
    next_instruction_id: u32,
    next_block_id: u32,
}

impl Function {
    pub fn new(name: &str) -> Self {
        let mut func = Self {
            id: FunctionId(0),
            name: name.to_string(),
            params: Vec::new(),
            blocks: Vec::new(),
            values: Vec::new(),
            instructions: Vec::new(),
            block_order: Vec::new(),
            next_value_id: 0,
            next_instruction_id: 0,
            next_block_id: 1,
        };
        func.blocks.push(Block {
            id: BlockId(0),
            instructions: Vec::new(),
            predecessors: Vec::new(),
            successors: Vec::new(),
        });
        func.block_order.push(BlockId(0));
        func
    }

    pub fn new_value(&mut self, value: Value) -> ValueId {
        let id = ValueId(self.next_value_id);
        self.next_value_id += 1;
        self.values.push(value);
        id
    }

    pub fn new_block(&mut self) -> BlockId {
        let id = BlockId(self.next_block_id);
        self.next_block_id += 1;
        self.blocks.push(Block {
            id,
            instructions: Vec::new(),
            predecessors: Vec::new(),
            successors: Vec::new(),
        });
        self.block_order.push(id);
        id
    }

    pub fn new_instruction(&mut self, inst: Instruction, block_id: BlockId) -> InstructionId {
        let id = InstructionId(self.next_instruction_id);
        self.next_instruction_id += 1;
        self.instructions.push(inst);
        if let Some(block) = self.blocks.iter_mut().find(|b| b.id == block_id) {
            block.instructions.push(id);
        }
        id
    }

    pub fn entry_block(&self) -> BlockId {
        BlockId(0)
    }
}

impl fmt::Display for Function {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        writeln!(f, "fn {} {{", self.name)?;
        for block_id in &self.block_order {
            writeln!(f, "  block{}:", block_id.0)?;
        }
        write!(f, "}}")
    }
}
