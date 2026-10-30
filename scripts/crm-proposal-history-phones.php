<?php
declare(strict_types=1);

/** Normalização livre de Laravel. Apenas leitura, nenhuma correspondência por last-8. */
function evyProposalPhoneVariants(mixed $value): ?array
{
    if (!is_string($value) || trim($value) === '' || strlen($value) > 160) {
        return null;
    }
    $value = str_replace(
        preg_split('//u', '０１２３４５６７８９', -1, PREG_SPLIT_NO_EMPTY),
        str_split('0123456789'),
        $value
    );
    $value = preg_replace('/[\s\p{Z}\x{200B}-\x{200D}\x{2060}\x{FEFF}().\x{2010}-\x{2015}\x{2212}\x{FE63}\x{FF0D}-]/u', '', trim($value));
    if (!is_string($value) || !preg_match('/^\+?[0-9]+$/D', $value)) {
        return null;
    }
    if (str_starts_with($value, '+') && !str_starts_with($value, '+55')) {
        return null;
    }
    $digits = ltrim($value, '+');
    if (str_starts_with($digits, '55') && in_array(strlen($digits), [12, 13], true)) {
        $digits = substr($digits, 2);
    }
    if (!in_array(strlen($digits), [10, 11], true)) {
        return null;
    }
    $ddd = substr($digits, 0, 2);
    $ddds = explode(' ', '11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99');
    if (!in_array($ddd, $ddds, true)) {
        return null;
    }
    $subscriber = substr($digits, 2);
    $modern = preg_match('/^9[0-9]{8}$/D', $subscriber) === 1;
    $legacyMobile = preg_match('/^[6-9][0-9]{7}$/D', $subscriber) === 1;
    $landline = preg_match('/^[2-5][0-9]{7}$/D', $subscriber) === 1;
    if (!$modern && !$legacyMobile && !$landline) {
        return null;
    }
    $canonical = $legacyMobile ? $ddd . '9' . $subscriber : $digits;
    $alternate = null;
    if ($modern && preg_match('/^[6-9][0-9]{7}$/D', substr($subscriber, 1)) === 1) {
        $alternate = $ddd . substr($subscriber, 1);
    } elseif ($legacyMobile) {
        $alternate = $digits;
    }
    $inputE164 = '+55' . $digits;
    $canonicalE164 = '+55' . $canonical;
    $variants = array_values(array_unique(array_filter([$inputE164, $canonicalE164, $alternate ? '+55' . $alternate : null])));
    return [
        'status' => $landline ? 'landline' : ($legacyMobile ? 'legacy_mobile' : 'mobile'),
        'input_e164' => $inputE164,
        'canonical_e164' => $canonicalE164,
        'variants_e164' => $variants,
        'match_warning' => count($variants) > 1 ? 'legacy_variant_not_identity_proof' : null,
    ];
}
