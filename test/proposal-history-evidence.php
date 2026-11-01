<?php
declare(strict_types=1);
function formatBrt(mixed $x): ?string {return $x ? (string) $x : null;}
require __DIR__ . '/../scripts/crm-proposal-history-evidence.php';
function fixture(array $fields): object {
 return (object) array_merge(['delivery_id'=>1,'item_id'=>1,'stage_id'=>3,'channel'=>'whatsapp',
    'delivery_channel'=>'whatsapp','delivery_status'=>'pending','provider'=>'zapi',
    'provider_message_id'=>null,'status'=>'pending','outbox_status'=>'pending',
    'sent_at'=>null,'accepted_at'=>null,'delivered_at'=>null,'read_at'=>null,'failed_at'=>null],$fields);
}
$cases=[
 ['scheduled', [], 'not_confirmed',false],
 ['attempt_no_receipt', ['sent_at'=>'2026-10-28 10:00:00'], 'submitted_unconfirmed',false],
 ['accepted_no_id',['accepted_at'=>'2026-10-28 10:00:00'], 'not_confirmed',false],
 ['id_no_accepted',['provider_message_id'=>'MSG1'], 'not_confirmed',false],
 ['accepted_with_id',['provider_message_id'=>'MSG1','accepted_at'=>'2026-10-28 10:00:00'], 'provider_accepted',true],
 ['delivered',['delivered_at'=>'2026-10-28 10:02:00'], 'delivered_confirmed',true],
 ['read',['read_at'=>'2026-10-28 10:03:00'], 'read_confirmed',true],
 ['unknown',['status'=>'unknown'], 'outcome_unknown',false],
 ['submitting',['outbox_status'=>'submitting'], 'outcome_unknown',false],
 ['failed',['status'=>'failed','failed_at'=>'2026-10-28 10:00:00'], 'failed',false],
];
foreach ($cases as [$label,$fields,$state,$accepted]) {
 $out=evyProposalItemEvidence(fixture($fields));
 if ($out['state']!==$state || $out['provider_accepted']!==$accepted) {
   fwrite(STDERR,"FAIL $label: ".json_encode($out)."\n");exit(1);
 }
}
echo 'PASS '.count($cases)." PHP evidence fixtures\n";

require_once __DIR__ . '/../scripts/crm-proposal-history-phones.php';
$group = evyProposalPhoneVariants('48996425287');
foreach ([
    ['5548996425287', 'whatsapp', 'exact'],
    ['4896425287', 'sms', 'legacy_variant'],
    ['5547996425287', 'whatsapp', 'mismatch'],
    ['5548996425287@c.us', 'whatsapp', 'exact'],
    ['5548996425287@s.whatsapp.net', 'whatsapp', 'exact'],
    ['invalid', 'whatsapp', 'unverifiable'],
    ['', 'whatsapp', 'not_recorded'],
    ['contato@example.test', 'email', 'not_phone_channel'],
] as [$recipient, $channel, $expected]) {
    if (evyProposalRecipientMatch($recipient, $channel, $group) !== $expected) {
        throw new RuntimeException('Recipient mismatch classification test failed: ' . $expected);
    }
}
echo "PASS 8 PHP concrete-recipient provenance fixtures\n";
