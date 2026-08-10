pub struct Runtime {
    memory: Vec<u8>,
}

impl Runtime {
    pub fn new() -> Self {
        Self { memory: Vec::new() }
    }

    pub fn allocate(&mut self, size: usize) -> usize {
        let offset = self.memory.len();
        self.memory.resize(self.memory.len() + size, 0);
        offset
    }

    pub fn store_i64(&mut self, offset: usize, value: i64) {
        let bytes = value.to_ne_bytes();
        self.memory[offset..offset + 8].copy_from_slice(&bytes);
    }

    pub fn load_i64(&self, offset: usize) -> i64 {
        let mut bytes = [0u8; 8];
        bytes.copy_from_slice(&self.memory[offset..offset + 8]);
        i64::from_ne_bytes(bytes)
    }
}

impl Default for Runtime {
    fn default() -> Self {
        Self::new()
    }
}
