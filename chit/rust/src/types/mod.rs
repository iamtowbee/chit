use std::fmt;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum TypeId {
    Void,
    Bool,
    I8,
    I16,
    I32,
    I64,
    U8,
    U16,
    U32,
    U64,
    F32,
    F64,
    Usize,
    Isize,
    Pointer(Box<TypeId>),
    Array {
        element: Box<TypeId>,
        length: usize,
    },
    Struct(Vec<TypeId>),
    Function {
        params: Vec<TypeId>,
        return_type: Box<TypeId>,
    },
}

impl TypeId {
    pub fn is_integer(&self) -> bool {
        matches!(self, TypeId::I8 | TypeId::I16 | TypeId::I32 | TypeId::I64 | TypeId::U8 | TypeId::U16 | TypeId::U32 | TypeId::U64 | TypeId::Usize | TypeId::Isize)
    }

    pub fn is_signed_integer(&self) -> bool {
        matches!(self, TypeId::I8 | TypeId::I16 | TypeId::I32 | TypeId::I64 | TypeId::Isize)
    }

    pub fn is_unsigned_integer(&self) -> bool {
        matches!(self, TypeId::U8 | TypeId::U16 | TypeId::U32 | TypeId::U64 | TypeId::Usize)
    }

    pub fn is_float(&self) -> bool {
        matches!(self, TypeId::F32 | TypeId::F64)
    }

    pub fn is_numeric(&self) -> bool {
        self.is_integer() || self.is_float()
    }

    pub fn bit_width(&self) -> Option<u32> {
        match self {
            TypeId::Bool => Some(1),
            TypeId::I8 | TypeId::U8 => Some(8),
            TypeId::I16 | TypeId::U16 => Some(16),
            TypeId::I32 | TypeId::U32 | TypeId::F32 => Some(32),
            TypeId::I64 | TypeId::U64 | TypeId::F64 => Some(64),
            TypeId::Usize | TypeId::Isize | TypeId::Pointer(_) => Some(64),
            _ => None,
        }
    }
}

impl fmt::Display for TypeId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            TypeId::Void => write!(f, "void"),
            TypeId::Bool => write!(f, "bool"),
            TypeId::I8 => write!(f, "i8"),
            TypeId::I16 => write!(f, "i16"),
            TypeId::I32 => write!(f, "i32"),
            TypeId::I64 => write!(f, "i64"),
            TypeId::U8 => write!(f, "u8"),
            TypeId::U16 => write!(f, "u16"),
            TypeId::U32 => write!(f, "u32"),
            TypeId::U64 => write!(f, "u64"),
            TypeId::F32 => write!(f, "f32"),
            TypeId::F64 => write!(f, "f64"),
            TypeId::Usize => write!(f, "usize"),
            TypeId::Isize => write!(f, "isize"),
            TypeId::Pointer(inner) => write!(f, "*{}", inner),
            TypeId::Array { element, length } => write!(f, "[{}; {}]", element, length),
            TypeId::Struct(fields) => {
                write!(f, "{{ ")?;
                for (i, field) in fields.iter().enumerate() {
                    if i > 0 { write!(f, ", ")?; }
                    write!(f, "{}", field)?;
                }
                write!(f, " }}")
            }
            TypeId::Function { params, return_type } => {
                write!(f, "fn(")?;
                for (i, param) in params.iter().enumerate() {
                    if i > 0 { write!(f, ", ")?; }
                    write!(f, "{}", param)?;
                }
                write!(f, ") -> {}", return_type)
            }
        }
    }
}
