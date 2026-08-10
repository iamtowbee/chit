#pragma once
#include <cstdint>
#include <cstddef>

#ifdef __cplusplus
extern "C" {
#endif

struct ChitLLVM;

ChitLLVM* chit_llvm_create(void);
void chit_llvm_destroy(ChitLLVM* c);
const uint8_t* chit_llvm_compile(ChitLLVM* c, const char* src, size_t* out_size);

#ifdef __cplusplus
}
#endif
