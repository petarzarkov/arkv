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

// ── Inner enum ────────────────────────────────────────────────────────────────

enum Inner {
    Pcg64(Pcg64),
    Xoroshiro128Plus(Xoroshiro128Plus),
    Xorshift128Plus(Xorshift128PlusRng),
    Mersenne(Mt19937GenRand64),
    Lcg32(Lcg32Rng),
}

impl Inner {
    fn from_seed(algorithm: &str, seed: u64) -> Self {
        match algorithm {
            "xoroshiro128+" => Inner::Xoroshiro128Plus(Xoroshiro128Plus::seed_from_u64(seed)),
            "xorshift128+" => Inner::Xorshift128Plus(Xorshift128PlusRng::seed_from_u64(seed)),
            "mersenne" => Inner::Mersenne(Mt19937GenRand64::seed_from_u64(seed)),
            "lcg32" => Inner::Lcg32(Lcg32Rng::seed_from_u64(seed)),
            _ => Inner::Pcg64(Pcg64::seed_from_u64(seed)),
        }
    }

    fn from_entropy(algorithm: &str) -> Self {
        match algorithm {
            "xoroshiro128+" => Inner::Xoroshiro128Plus(Xoroshiro128Plus::from_entropy()),
            "xorshift128+" => Inner::Xorshift128Plus(Xorshift128PlusRng::from_entropy()),
            "mersenne" => Inner::Mersenne(Mt19937GenRand64::from_entropy()),
            "lcg32" => Inner::Lcg32(Lcg32Rng::from_entropy()),
            _ => Inner::Pcg64(Pcg64::from_entropy()),
        }
    }

    fn next_u32(&mut self) -> u32 {
        match self {
            Inner::Pcg64(r) => r.gen::<u32>(),
            Inner::Xoroshiro128Plus(r) => r.gen::<u32>(),
            Inner::Xorshift128Plus(r) => r.gen::<u32>(),
            Inner::Mersenne(r) => r.gen::<u32>(),
            Inner::Lcg32(r) => r.gen::<u32>(),
        }
    }

    fn next_f64(&mut self) -> f64 {
        match self {
            Inner::Pcg64(r) => r.gen::<f64>(),
            Inner::Xoroshiro128Plus(r) => r.gen::<f64>(),
            Inner::Xorshift128Plus(r) => r.gen::<f64>(),
            Inner::Mersenne(r) => r.gen::<f64>(),
            Inner::Lcg32(r) => r.gen::<f64>(),
        }
    }

    fn next_range(&mut self, min: u32, max: u32) -> u32 {
        match self {
            Inner::Pcg64(r) => r.gen_range(min..max),
            Inner::Xoroshiro128Plus(r) => r.gen_range(min..max),
            Inner::Xorshift128Plus(r) => r.gen_range(min..max),
            Inner::Mersenne(r) => r.gen_range(min..max),
            Inner::Lcg32(r) => r.gen_range(min..max),
        }
    }
}

// ── ArkvRng (WASM-exported) ───────────────────────────────────────────────────

#[wasm_bindgen]
pub struct ArkvRng {
    inner: Inner,
}

#[wasm_bindgen]
impl ArkvRng {
    /// Create a seeded RNG. `algorithm` selects the PRNG backend:
    /// `"pcg64"` (default), `"xoroshiro128+"`, `"xorshift128+"`, `"mersenne"`, `"lcg32"`.
    #[wasm_bindgen(constructor)]
    pub fn new(seed: u64, algorithm: &str) -> ArkvRng {
        ArkvRng {
            inner: Inner::from_seed(algorithm, seed),
        }
    }

    /// Create an RNG seeded from OS entropy.
    pub fn from_entropy(algorithm: &str) -> ArkvRng {
        ArkvRng {
            inner: Inner::from_entropy(algorithm),
        }
    }

    pub fn next_u32(&mut self) -> u32 {
        self.inner.next_u32()
    }

    pub fn next_float(&mut self) -> f64 {
        self.inner.next_f64()
    }

    pub fn next_range(&mut self, min: u32, max: u32) -> u32 {
        if min >= max {
            return min;
        }
        self.inner.next_range(min, max)
    }

    /// Generates an array of N random u32 numbers in a single boundary crossing.
    /// wasm-bindgen automatically converts Vec<u32> to a Uint32Array in JS.
    pub fn next_u32_array(&mut self, length: usize) -> Vec<u32> {
        let mut buffer = Vec::with_capacity(length);
        for _ in 0..length {
            buffer.push(self.inner.next_u32());
        }
        buffer
    }

    /// Generates an array of N random f64 floats in [0, 1) in a single boundary crossing.
    /// wasm-bindgen automatically converts Vec<f64> to a Float64Array in JS.
    pub fn next_f64_array(&mut self, length: usize) -> Vec<f64> {
        let mut buffer = Vec::with_capacity(length);
        for _ in 0..length {
            buffer.push(self.inner.next_f64());
        }
        buffer
    }

    /// Generates an array of N random u32 integers in [min, max) in a single boundary crossing.
    /// wasm-bindgen automatically converts Vec<u32> to a Uint32Array in JS.
    pub fn next_range_array(&mut self, min: u32, max: u32, length: usize) -> Vec<u32> {
        if min >= max {
            return vec![min; length];
        }
        let mut buffer = Vec::with_capacity(length);
        for _ in 0..length {
            buffer.push(self.inner.next_range(min, max));
        }
        buffer
    }

    /// Generates the swap indices for a Fisher-Yates shuffle of `length` elements.
    /// Returns an array of size (length - 1).
    pub fn next_shuffle_indices(&mut self, length: u32) -> Vec<u32> {
        if length <= 1 {
            return Vec::new();
        }
        let capacity = (length - 1) as usize;
        let mut indices = Vec::with_capacity(capacity);
        for i in (1..length).rev() {
            indices.push(self.inner.next_range(0, i + 1));
        }
        indices
    }
}
