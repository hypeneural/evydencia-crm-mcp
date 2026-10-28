<?php
declare(strict_types=1);
require __DIR__ . '/../scripts/crm-proposal-history-phones.php';
$cases = [
 ['48996425287', '+5548996425287', ['+5548996425287','+554896425287']],
 ['4896425287', '+5548996425287', ['+554896425287','+5548996425287']],
 ['+55 (48) 99642-5287', '+5548996425287', ['+5548996425287','+554896425287']],
 ["(48)\xc2\xa099642\xe2\x80\x915287", '+5548996425287', ['+5548996425287','+554896425287']],
 ['４８９９６４２５２８７', '+5548996425287', ['+5548996425287','+554896425287']],
 ['48 3220-0440', '+554832200440', ['+554832200440']],
 ['48912345678', '+5548912345678', ['+5548912345678']],
 ['47996425287', '+5547996425287', ['+5547996425287','+554796425287']],
];
foreach ($cases as [$raw,$expected,$variants]) {
    $p=evyProposalPhoneVariants($raw);
    if ($p===null || $p['canonical_e164']!==$expected || $p['variants_e164']!==$variants) {
        fwrite(STDERR, 'FAIL case: ' . json_encode($raw) . ': '.json_encode($p).'\n');exit(1);
    }
}
foreach (['+1 408 555 1212','48x996425287','48;996425287','00 99642-5287','+55+48996425287','42','<script>48996425287</script>'] as $raw) {
    if (evyProposalPhoneVariants($raw)!==null) {fwrite(STDERR,"FAIL invalid input\n");exit(1);}
}
echo "PASS 15 PHP phone normalizer fixtures\n";
