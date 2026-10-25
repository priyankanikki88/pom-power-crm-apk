<?php
if (php_sapi_name() !== 'cli') { http_response_code(404); exit; }
chdir('/home/u843646515/domains/crm.urbandryclean.in/public_html');
require 'config/database.php';
$db=Database::getConnection(); $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE,PDO::FETCH_ASSOC);
$t=$db->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN); $o=['tables'=>$t];
foreach(['garments','categories','garment_categories','services','price_lists','price_list_items'] as $n){ if(in_array($n,$t)){
 $cols=$db->query("SHOW COLUMNS FROM `$n`")->fetchAll(PDO::FETCH_COLUMN);
 $keep=array_values(array_filter($cols,function($c){return !preg_match('/image|created|updated|desc|barcode|hsn/i',$c);}));
 $o[$n]=['cols'=>$cols,'rows'=>$db->query('SELECT `'.implode('`,`',$keep).'` FROM `'.$n.'`')->fetchAll(PDO::FETCH_NUM),'keep'=>$keep]; } }
echo "@@START@@".base64_encode(gzcompress(json_encode($o),9))."@@END@@";
