<?php
if (php_sapi_name() !== 'cli') { http_response_code(404); exit; }
$out = __DIR__ . '/out.txt';
file_put_contents($out, "STARTED " . date('c') . "\n");
try {
chdir('/home/u843646515/domains/crm.urbandryclean.in/public_html');
$_SERVER['HTTP_HOST'] = $_SERVER['HTTP_HOST'] ?? 'crm.urbandryclean.in'; require_once 'config/config.php'; require_once 'config/database.php';
$db = Database::getConnection();
$t = $db->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
$s = "TABLES\t" . implode(',', $t) . "\n";
foreach (['garments','categories','garment_categories','services','price_lists','price_list_items','garment_services'] as $n) {
  if (!in_array($n, $t)) continue;
  $cols = $db->query("SHOW COLUMNS FROM `$n`")->fetchAll(PDO::FETCH_COLUMN);
  $keep = array_values(array_filter($cols, function($c){ return !preg_match('/image|created|updated|description|barcode|photo/i', $c); }));
  $s .= "##TABLE\t$n\t" . implode("\t", $keep) . "\n";
  foreach ($db->query('SELECT `' . implode('`,`', $keep) . "` FROM `$n`")->fetchAll(PDO::FETCH_NUM) as $r) {
    $s .= implode("\t", array_map(function($v){ return $v === null ? '\\N' : str_replace(["\t","\n","\r"], ' ', (string)$v); }, $r)) . "\n";
  }
}
file_put_contents($out, $s . "##DONE\n", FILE_APPEND);
} catch (Throwable $e) { file_put_contents($out, "ERROR " . $e->getMessage() . "\n", FILE_APPEND); }
