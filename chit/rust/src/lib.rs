use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use std::ptr;

pub mod ir;
pub mod types;
pub mod codegen;
pub mod transforms;
pub mod runtime;

// C++ FFI
extern "C" {
    fn chit_llvm_create() -> *mut std::ffi::c_void;
    fn chit_llvm_destroy(c: *mut std::ffi::c_void);
    fn chit_llvm_compile(c: *mut std::ffi::c_void, src: *const c_char, out_size: *mut usize) -> *const u8;
}

// Opaque handle
pub struct Compiler {
    llvm: *mut std::ffi::c_void,
}

impl Compiler {
    pub fn new() -> Self {
        Self {
            llvm: unsafe { chit_llvm_create() },
        }
    }

    pub fn compile(&self, source: &str) -> Option<Vec<u8>> {
        let c_src = CString::new(source).ok()?;
        let mut size: usize = 0;
        let ptr = unsafe { chit_llvm_compile(self.llvm, c_src.as_ptr(), &mut size) };
        if ptr.is_null() || size == 0 {
            None
        } else {
            Some(unsafe { std::slice::from_raw_parts(ptr, size) }.to_vec())
        }
    }
}

impl Drop for Compiler {
    fn drop(&mut self) {
        unsafe { chit_llvm_destroy(self.llvm); }
    }
}

// C FFI exports
#[no_mangle]
pub extern "C" fn chit_create() -> *mut Compiler {
    Box::into_raw(Box::new(Compiler::new()))
}

#[no_mangle]
pub extern "C" fn chit_compile(ptr: *mut Compiler, source: *const c_char, out_size: *mut usize) -> *const u8 {
    if ptr.is_null() || source.is_null() {
        return ptr::null();
    }
    let compiler = unsafe { &*ptr };
    let src = unsafe { CStr::from_ptr(source) };
    match compiler.compile(src.to_str().unwrap_or("")) {
        Some(code) => {
            unsafe { *out_size = code.len(); }
            let boxed = code.into_boxed_slice();
            Box::into_raw(boxed) as *const u8
        }
        None => ptr::null(),
    }
}

#[no_mangle]
pub extern "C" fn chit_destroy(ptr: *mut Compiler) {
    if !ptr.is_null() {
        unsafe { drop(Box::from_raw(ptr)); }
    }
}

#[no_mangle]
pub extern "C" fn chit_free_code(ptr: *mut u8, size: usize) {
    if !ptr.is_null() {
        unsafe {
            drop(Box::from_raw(std::slice::from_raw_parts_mut(ptr, size)));
        }
    }
}
