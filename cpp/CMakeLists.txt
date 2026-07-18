cmake_minimum_required(VERSION 3.10)
project(chit_cpp)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_library(chit_llvm SHARED src/llvm_backend.cpp)
target_include_directories(chit_llvm PUBLIC include)
target_compile_options(chit_llvm PRIVATE -O3 -march=native -flto)

install(TARGETS chit_llvm LIBRARY DESTINATION lib)
