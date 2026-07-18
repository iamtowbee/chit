.PHONY: build build-native build-cpp install clean test

build: build-native

build-native:
	cd rust && cargo build --release
	mkdir -p native
	cp rust/target/release/libchit.dylib native/ 2>/dev/null || cp rust/target/release/libchit.so native/

build-cpp:
	mkdir -p cpp/build
	cd cpp/build && cmake -DCMAKE_BUILD_TYPE=Release ..
	cd cpp/build && make

install:
	pip install -e python/

clean:
	cd rust && cargo clean
	rm -rf cpp/build native python/build python/dist python/*.egg-info

test:
	pytest python/tests/

all: build install
