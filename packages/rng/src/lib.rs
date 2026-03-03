use rand::{Rng, SeedableRng};
use rand_pcg::Pcg64;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct ArkvRng {
    rng: Pcg64,
}

#[wasm_bindgen]
impl ArkvRng {
    #[wasm_bindgen(constructor)]
    pub fn new(seed: u64) -> ArkvRng {
        ArkvRng {
            rng: Pcg64::seed_from_u64(seed),
        }
    }

    pub fn from_entropy() -> ArkvRng {
        ArkvRng {
            rng: Pcg64::from_entropy(),
        }
    }

    pub fn next_u32(&mut self) -> u32 {
        self.rng.gen()
    }

    pub fn next_float(&mut self) -> f64 {
        self.rng.gen()
    }

    pub fn next_range(&mut self, min: u32, max: u32) -> u32 {
        if min >= max {
            return min; 
        }
        self.rng.gen_range(min..max)
    }

    /// Generates an array of N random u32 numbers in a single boundary crossing.
    /// wasm-bindgen automatically converts Vec<u32> to a Uint32Array in JS.
    pub fn next_u32_array(&mut self, length: usize) -> Vec<u32> {
        // Pre-allocate the vector for performance
        let mut buffer = Vec::with_capacity(length);
        for _ in 0..length {
            buffer.push(self.rng.gen());
        }
        buffer
    }

    /// Generates the exact sequence of swap indices needed for a Fisher-Yates shuffle.
    /// Returns an array of size (length - 1).
    pub fn next_shuffle_indices(&mut self, length: u32) -> Vec<u32> {
        if length <= 1 {
            return Vec::new();
        }
        
        // We need (length - 1) indices for a complete shuffle
        let capacity = (length - 1) as usize;
        let mut indices = Vec::with_capacity(capacity);
        
        for i in (1..length).rev() {
            // gen_range is exclusive, so we use 0..(i + 1)
            indices.push(self.rng.gen_range(0..(i + 1)));
        }
        
        indices
    }
}
