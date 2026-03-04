use rand::{Rng, RngCore, SeedableRng};
use rand_mt::Mt19937GenRand64;
use rand_pcg::Pcg64;
use rand_xoshiro::Xoroshiro128Plus;
use wasm_bindgen::prelude::*;

// ── splitmix64 — expands a single seed into independent u64 values ────────────

fn splitmix64(x: u64) -> u64 {
    let x = x.wrapping_add(0x9e3779b97f4a7c15);
    let x = (x ^ (x >> 30)).wrapping_mul(0xbf58476d1ce4e5b9);
    let x = (x ^ (x >> 27)).wrapping_mul(0x94d049bb133111eb);
    x ^ (x >> 31)
}

// ── Hand-rolled Xorshift128+ ──────────────────────────────────────────────────
// State: two non-zero u64 values. Algorithm matches the canonical xorshift128+.

struct Xorshift128PlusRng {
    s0: u64,
    s1: u64,
}

impl Xorshift128PlusRng {
    fn from_u64_seed(seed: u64) -> Self {
        let s0 = splitmix64(seed);
        let s1 = splitmix64(s0);
        Self {
            s0: if s0 == 0 { 1 } else { s0 },
            s1: if s1 == 0 { 2 } else { s1 },
        }
    }

    fn next_u64_inner(&mut self) -> u64 {
        let mut t = self.s0;
        let s = self.s1;
        self.s0 = s;
        t ^= t << 23;
        t ^= t >> 17;
        t ^= s ^ (s >> 26);
        self.s1 = t;
        t.wrapping_add(s)
    }
}

impl RngCore for Xorshift128PlusRng {
    fn next_u32(&mut self) -> u32 {
        (self.next_u64_inner() >> 32) as u32
    }

    fn next_u64(&mut self) -> u64 {
        self.next_u64_inner()
    }

    fn fill_bytes(&mut self, dest: &mut [u8]) {
        let mut chunks = dest.chunks_exact_mut(8);
        for chunk in chunks.by_ref() {
            chunk.copy_from_slice(&self.next_u64_inner().to_le_bytes());
        }
        let rem = chunks.into_remainder();
        if !rem.is_empty() {
            let r = self.next_u64_inner().to_le_bytes();
            rem.copy_from_slice(&r[..rem.len()]);
        }
    }

    fn try_fill_bytes(&mut self, dest: &mut [u8]) -> Result<(), rand::Error> {
        self.fill_bytes(dest);
        Ok(())
    }
}

impl SeedableRng for Xorshift128PlusRng {
    type Seed = [u8; 16];

    fn from_seed(seed: [u8; 16]) -> Self {
        let s0 = u64::from_le_bytes(seed[..8].try_into().unwrap());
        let s1 = u64::from_le_bytes(seed[8..].try_into().unwrap());
        Self {
            s0: if s0 == 0 { 1 } else { s0 },
            s1: if s1 == 0 { 2 } else { s1 },
        }
    }

    fn seed_from_u64(seed: u64) -> Self {
        Xorshift128PlusRng::from_u64_seed(seed)
    }
}

// ── Hand-rolled LCG32 ─────────────────────────────────────────────────────────
// Classic Knuth multiplicative LCG: state = state * a + c (mod 2^64).
// Output: upper 32 bits of state (discards lower-quality low bits).

struct Lcg32Rng {
    state: u64,
}

impl Lcg32Rng {
    fn from_u64_seed(seed: u64) -> Self {
        Self { state: seed | 1 }
    }

    fn step(&mut self) -> u32 {
        self.state = self.state
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);
        (self.state >> 33) as u32
    }
}

impl RngCore for Lcg32Rng {
    fn next_u32(&mut self) -> u32 {
        self.step()
    }

    fn next_u64(&mut self) -> u64 {
        let hi = self.step() as u64;
        let lo = self.step() as u64;
        (hi << 32) | lo
    }

    fn fill_bytes(&mut self, dest: &mut [u8]) {
        let mut chunks = dest.chunks_exact_mut(4);
        for chunk in chunks.by_ref() {
            chunk.copy_from_slice(&self.step().to_le_bytes());
        }
        let rem = chunks.into_remainder();
        if !rem.is_empty() {
            let r = self.step().to_le_bytes();
            rem.copy_from_slice(&r[..rem.len()]);
        }
    }

    fn try_fill_bytes(&mut self, dest: &mut [u8]) -> Result<(), rand::Error> {
        self.fill_bytes(dest);
        Ok(())
    }
}

impl SeedableRng for Lcg32Rng {
    type Seed = [u8; 8];

    fn from_seed(seed: [u8; 8]) -> Self {
        let state = u64::from_le_bytes(seed);
        Self { state: state | 1 }
    }

    fn seed_from_u64(seed: u64) -> Self {
        Lcg32Rng::from_u64_seed(seed)
    }
}

// ── FNV-1a 64-bit — deterministic string → u64 ───────────────────────────────

const FNV1A_PRIME: u64 = 1_099_511_628_211;
const FNV1A_OFFSET: u64 = 14_695_981_039_346_656_037;

fn fnv1a_64(s: &str) -> u64 {
    let mut h = FNV1A_OFFSET;
    for byte in s.as_bytes() {
        h ^= *byte as u64;
        h = h.wrapping_mul(FNV1A_PRIME);
    }
    h
}

// ── Per-algorithm WASM structs ─────────────────────────────────────────────────
// Each algorithm gets its own specialized struct — no runtime dispatch.
// The compiler can inline the entire hot path: JS → Wasm → RNG core.

macro_rules! export_rng {
    ($wasm_name:ident, $rng_type:ty) => {
        #[wasm_bindgen]
        pub struct $wasm_name {
            inner: $rng_type,
            f64_buf: Vec<f64>,
            u32_buf: Vec<u32>,
        }

        #[wasm_bindgen]
        impl $wasm_name {
            /// Create a seeded RNG.
            #[wasm_bindgen(constructor)]
            pub fn new(seed: u64) -> Self {
                Self {
                    inner: <$rng_type>::seed_from_u64(seed),
                    f64_buf: Vec::new(),
                    u32_buf: Vec::new(),
                }
            }

            /// Create a seeded RNG from a string seed (hashed via FNV-1a 64-bit).
            pub fn from_str_seed(seed: &str) -> Self {
                Self {
                    inner: <$rng_type>::seed_from_u64(fnv1a_64(seed)),
                    f64_buf: Vec::new(),
                    u32_buf: Vec::new(),
                }
            }

            /// Create an RNG seeded from OS entropy.
            pub fn from_entropy() -> Self {
                Self {
                    inner: <$rng_type>::from_entropy(),
                    f64_buf: Vec::new(),
                    u32_buf: Vec::new(),
                }
            }

            pub fn next_u32(&mut self) -> u32 {
                self.inner.next_u32()
            }

            pub fn next_float(&mut self) -> f64 {
                self.inner.gen::<f64>()
            }

            pub fn next_range(&mut self, min: u32, max: u32) -> u32 {
                if min >= max {
                    return min;
                }
                self.inner.gen_range(min..max)
            }

            /// Generates an array of N random u32 numbers in a single boundary crossing.
            pub fn next_u32_array(&mut self, length: usize) -> Vec<u32> {
                let mut buffer = Vec::with_capacity(length);
                for _ in 0..length {
                    buffer.push(self.inner.next_u32());
                }
                buffer
            }

            /// Generates an array of N random f64 floats in [0, 1) in a single boundary crossing.
            pub fn next_f64_array(&mut self, length: usize) -> Vec<f64> {
                let mut buffer = Vec::with_capacity(length);
                for _ in 0..length {
                    buffer.push(self.inner.gen::<f64>());
                }
                buffer
            }

            /// Generates an array of N random u32 integers in [min, max) in a single boundary crossing.
            pub fn next_range_array(&mut self, min: u32, max: u32, length: usize) -> Vec<u32> {
                if min >= max {
                    return vec![min; length];
                }
                let mut buffer = Vec::with_capacity(length);
                for _ in 0..length {
                    buffer.push(self.inner.gen_range(min..max));
                }
                buffer
            }

            /// Generates the swap indices for a Fisher-Yates shuffle of `length` elements.
            pub fn next_shuffle_indices(&mut self, length: u32) -> Vec<u32> {
                if length <= 1 {
                    return Vec::new();
                }
                let capacity = (length - 1) as usize;
                let mut indices = Vec::with_capacity(capacity);
                for i in (1..length).rev() {
                    indices.push(self.inner.gen_range(0u32..i + 1));
                }
                indices
            }

            // ── Zero-copy batch methods ───────────────────────────────────────────────
            // These fill a preallocated internal buffer and return a raw pointer into
            // WASM linear memory. In JavaScript, wrap the result with:
            //   new Float64Array(wasm.memory.buffer, ptr, length)
            //   new Uint32Array(wasm.memory.buffer, ptr, length)
            // The view is valid until the next WASM call on this instance.

            /// Fill internal f64 buffer with `length` floats in [0, 1) and return pointer.
            pub fn fill_f64s(&mut self, length: usize) -> u32 {
                self.f64_buf.resize(length, 0.0);
                for v in self.f64_buf.iter_mut() {
                    *v = self.inner.gen::<f64>();
                }
                self.f64_buf.as_ptr() as u32
            }

            /// Fill internal u32 buffer with `length` integers in [0, 2^32) and return pointer.
            pub fn fill_u32s(&mut self, length: usize) -> u32 {
                self.u32_buf.resize(length, 0);
                for v in self.u32_buf.iter_mut() {
                    *v = self.inner.next_u32();
                }
                self.u32_buf.as_ptr() as u32
            }

            /// Fill internal u32 buffer with `length` values in [min, max) and return pointer.
            pub fn fill_range_u32s(&mut self, min: u32, max: u32, length: usize) -> u32 {
                self.u32_buf.resize(length, 0);
                if min >= max {
                    self.u32_buf.fill(min);
                } else {
                    for v in self.u32_buf.iter_mut() {
                        *v = self.inner.gen_range(min..max);
                    }
                }
                self.u32_buf.as_ptr() as u32
            }

            /// Fill internal u32 buffer with Fisher-Yates swap indices for `length` elements
            /// and return pointer. Returns 0 if length <= 1 (no swaps needed).
            pub fn fill_shuffle_u32s(&mut self, length: u32) -> u32 {
                if length <= 1 {
                    return 0;
                }
                let n = (length - 1) as usize;
                self.u32_buf.resize(n, 0);
                for (slot, i) in self.u32_buf.iter_mut().zip((1..length).rev()) {
                    *slot = self.inner.gen_range(0u32..i + 1);
                }
                self.u32_buf.as_ptr() as u32
            }
        }
    };
}

export_rng!(ArkvPcg64, Pcg64);
export_rng!(ArkvXoroshiro128Plus, Xoroshiro128Plus);
export_rng!(ArkvXorshift128Plus, Xorshift128PlusRng);
export_rng!(ArkvMersenne, Mt19937GenRand64);
export_rng!(ArkvLcg32, Lcg32Rng);
