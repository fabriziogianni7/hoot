// SPDX-License-Identifier: LGPL-3.0-only
//
// This file is provided WITHOUT ANY WARRANTY;
// without even the implied warranty of MERCHANTABILITY
// or FITNESS FOR A PARTICULAR PURPOSE.

use e3_bfv_helpers::decode_bfv_params_arc;
use e3_compute_provider::FHEInputs;
use fhe_rs::bfv::Ciphertext;
use fhe_traits::{DeserializeParametrized, Serialize};

/// Implementation of the CiphertextProcessor function
pub fn fhe_processor(fhe_inputs: &FHEInputs) -> Vec<u8> {
    let params = decode_bfv_params_arc(&fhe_inputs.params);


    let ct1 = Ciphertext::from_bytes(&fhe_inputs.ciphertexts[0].0, &params).unwrap();
    let mut difference = ct1;

    let ct2 = Ciphertext::from_bytes(&fhe_inputs.ciphertexts[1].0, &params).unwrap();
    difference -= &ct2;

    difference.to_bytes()
}

#[cfg(test)]
mod tests {
    use super::*;
    use anyhow::Result;
    use e3_bfv_helpers::{build_bfv_params_arc, encode_bfv_params, params::SET_2048_1032193_1};
    use fhe_rs::bfv::{Encoding, Plaintext, PublicKey, SecretKey};
    use fhe_traits::FheEncoder;
    use fhe_traits::FheEncrypter;
    use fhe_traits::{DeserializeParametrized, FheDecrypter, Serialize};
    use rand::{rngs::OsRng, thread_rng};

    #[test]
    fn test() -> Result<()> {
        let mut rng = thread_rng();

        let (degree, plaintext_modulus, moduli) = SET_2048_1032193_1;
        let params = build_bfv_params_arc(degree, plaintext_modulus, &moduli);

        let secret_key = SecretKey::random(&params, &mut OsRng);
        let public_key = PublicKey::new(&secret_key, &mut rng);

        // 10
        let ten = public_key.try_encrypt(
            &Plaintext::try_encode(&[10u64], Encoding::poly(), &params)?,
            &mut rng,
        )?;

        // other 10
        let other_ten = public_key.try_encrypt(
            &Plaintext::try_encode(&[10u64], Encoding::poly(), &params)?,
            &mut rng,
        )?;


        // Prepare inputs
        let fhe_inputs = FHEInputs {
            params: encode_bfv_params(&params),
            ciphertexts: vec![(ten.to_bytes(), 0), (other_ten.to_bytes(), 1)],
        };

        // Run the processor
        let result = fhe_processor(&fhe_inputs);

        // Decrypt result
        let decrypted = secret_key.try_decrypt(&Ciphertext::from_bytes(&result, &params)?)?;
        
        //they should give 0
        assert_eq!(decrypted.value[0], 0);
        Ok(())
    }
}
