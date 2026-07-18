fn main() {
    cc::Build::new()
        .file("../cpp/src/llvm_backend.cpp")
        .include("../cpp/include")
        .std("c++17")
        .flag("-O3")
        .flag("-march=native")
        .compile("chit_llvm");

    println!("cargo:rustc-link-lib=c++");
}
