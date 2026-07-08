-- カテゴリ名を日本語から英語表記に変更する。
-- categories.name / transactions.category / store_category_rules.category の
-- 3テーブルに同じカテゴリ名文字列が重複保持されているため、一括で揃える。
-- 既に英語化済みの行は WHERE name IN (...) に一致しないため、再実行しても安全（冪等）。

UPDATE kenyakugo.categories
  SET name = CASE name
    WHEN '外食' THEN 'Dining Out'
    WHEN '自炊' THEN 'Home Cooking'
    WHEN 'カフェ' THEN 'Cafe'
    WHEN '家賃' THEN 'Rent'
    WHEN '通信' THEN 'Phone'
    WHEN 'メディア' THEN 'Media'
    WHEN 'マッサージ' THEN 'Massage'
    WHEN 'ジム' THEN 'Gym'
    WHEN '医薬品' THEN 'Pharmacy'
    WHEN 'ファッション' THEN 'Fashion'
    WHEN 'EC' THEN 'Online Shopping'
    WHEN '学習' THEN 'Learning'
    WHEN '旅行' THEN 'Travel'
    WHEN 'エンタメ' THEN 'Entertainment'
    WHEN '交通費' THEN 'Transport'
    WHEN '日用品' THEN 'Daily Goods'
    WHEN '転送' THEN 'Transfer'
    WHEN '現金' THEN 'Cash'
    WHEN 'その他' THEN 'Other'
    WHEN '食料品' THEN 'Groceries'
    WHEN 'サウナ/スパ' THEN 'Sauna/Spa'
    WHEN 'スポーツ' THEN 'Sports'
    WHEN '美容' THEN 'Beauty'
    WHEN '飲み会' THEN 'Drinks'
    WHEN 'ショッピング' THEN 'Shopping'
    WHEN '医療' THEN 'Medical'
    WHEN '健康' THEN 'Health'
    WHEN '薬' THEN 'Medicine'
    WHEN '書籍' THEN 'Books'
    WHEN 'ゲーム' THEN 'Games'
    WHEN 'カメラ' THEN 'Camera'
    WHEN '音楽' THEN 'Music'
    WHEN '衣類' THEN 'Clothing'
    WHEN '車' THEN 'Car'
    WHEN '自転車' THEN 'Bicycle'
    WHEN '海外' THEN 'Overseas'
    WHEN '水道' THEN 'Water'
    WHEN '仕事' THEN 'Work'
    WHEN '電気' THEN 'Electricity'
    WHEN '貯金' THEN 'Savings'
    ELSE name
  END
  WHERE name IN (
    '外食', '自炊', 'カフェ', '家賃', '通信', 'メディア', 'マッサージ', 'ジム',
    '医薬品', 'ファッション', 'EC', '学習', '旅行', 'エンタメ', '交通費', '日用品',
    '転送', '現金', 'その他', '食料品', 'サウナ/スパ', 'スポーツ', '美容', '飲み会',
    'ショッピング', '医療', '健康', '薬', '書籍', 'ゲーム', 'カメラ', '音楽', '衣類',
    '車', '自転車', '海外', '水道', '仕事', '電気', '貯金'
  );

UPDATE kenyakugo.transactions
  SET category = CASE category
    WHEN '外食' THEN 'Dining Out'
    WHEN '自炊' THEN 'Home Cooking'
    WHEN 'カフェ' THEN 'Cafe'
    WHEN '家賃' THEN 'Rent'
    WHEN '通信' THEN 'Phone'
    WHEN 'メディア' THEN 'Media'
    WHEN 'マッサージ' THEN 'Massage'
    WHEN 'ジム' THEN 'Gym'
    WHEN '医薬品' THEN 'Pharmacy'
    WHEN 'ファッション' THEN 'Fashion'
    WHEN 'EC' THEN 'Online Shopping'
    WHEN '学習' THEN 'Learning'
    WHEN '旅行' THEN 'Travel'
    WHEN 'エンタメ' THEN 'Entertainment'
    WHEN '交通費' THEN 'Transport'
    WHEN '日用品' THEN 'Daily Goods'
    WHEN '転送' THEN 'Transfer'
    WHEN '現金' THEN 'Cash'
    WHEN 'その他' THEN 'Other'
    WHEN '食料品' THEN 'Groceries'
    WHEN 'サウナ/スパ' THEN 'Sauna/Spa'
    WHEN 'スポーツ' THEN 'Sports'
    WHEN '美容' THEN 'Beauty'
    WHEN '飲み会' THEN 'Drinks'
    WHEN 'ショッピング' THEN 'Shopping'
    WHEN '医療' THEN 'Medical'
    WHEN '健康' THEN 'Health'
    WHEN '薬' THEN 'Medicine'
    WHEN '書籍' THEN 'Books'
    WHEN 'ゲーム' THEN 'Games'
    WHEN 'カメラ' THEN 'Camera'
    WHEN '音楽' THEN 'Music'
    WHEN '衣類' THEN 'Clothing'
    WHEN '車' THEN 'Car'
    WHEN '自転車' THEN 'Bicycle'
    WHEN '海外' THEN 'Overseas'
    WHEN '水道' THEN 'Water'
    WHEN '仕事' THEN 'Work'
    WHEN '電気' THEN 'Electricity'
    WHEN '貯金' THEN 'Savings'
    ELSE category
  END
  WHERE category IN (
    '外食', '自炊', 'カフェ', '家賃', '通信', 'メディア', 'マッサージ', 'ジム',
    '医薬品', 'ファッション', 'EC', '学習', '旅行', 'エンタメ', '交通費', '日用品',
    '転送', '現金', 'その他', '食料品', 'サウナ/スパ', 'スポーツ', '美容', '飲み会',
    'ショッピング', '医療', '健康', '薬', '書籍', 'ゲーム', 'カメラ', '音楽', '衣類',
    '車', '自転車', '海外', '水道', '仕事', '電気', '貯金'
  );

UPDATE kenyakugo.store_category_rules
  SET category = CASE category
    WHEN '外食' THEN 'Dining Out'
    WHEN '自炊' THEN 'Home Cooking'
    WHEN 'カフェ' THEN 'Cafe'
    WHEN '家賃' THEN 'Rent'
    WHEN '通信' THEN 'Phone'
    WHEN 'メディア' THEN 'Media'
    WHEN 'マッサージ' THEN 'Massage'
    WHEN 'ジム' THEN 'Gym'
    WHEN '医薬品' THEN 'Pharmacy'
    WHEN 'ファッション' THEN 'Fashion'
    WHEN 'EC' THEN 'Online Shopping'
    WHEN '学習' THEN 'Learning'
    WHEN '旅行' THEN 'Travel'
    WHEN 'エンタメ' THEN 'Entertainment'
    WHEN '交通費' THEN 'Transport'
    WHEN '日用品' THEN 'Daily Goods'
    WHEN '転送' THEN 'Transfer'
    WHEN '現金' THEN 'Cash'
    WHEN 'その他' THEN 'Other'
    WHEN '食料品' THEN 'Groceries'
    WHEN 'サウナ/スパ' THEN 'Sauna/Spa'
    WHEN 'スポーツ' THEN 'Sports'
    WHEN '美容' THEN 'Beauty'
    WHEN '飲み会' THEN 'Drinks'
    WHEN 'ショッピング' THEN 'Shopping'
    WHEN '医療' THEN 'Medical'
    WHEN '健康' THEN 'Health'
    WHEN '薬' THEN 'Medicine'
    WHEN '書籍' THEN 'Books'
    WHEN 'ゲーム' THEN 'Games'
    WHEN 'カメラ' THEN 'Camera'
    WHEN '音楽' THEN 'Music'
    WHEN '衣類' THEN 'Clothing'
    WHEN '車' THEN 'Car'
    WHEN '自転車' THEN 'Bicycle'
    WHEN '海外' THEN 'Overseas'
    WHEN '水道' THEN 'Water'
    WHEN '仕事' THEN 'Work'
    WHEN '電気' THEN 'Electricity'
    WHEN '貯金' THEN 'Savings'
    ELSE category
  END
  WHERE category IN (
    '外食', '自炊', 'カフェ', '家賃', '通信', 'メディア', 'マッサージ', 'ジム',
    '医薬品', 'ファッション', 'EC', '学習', '旅行', 'エンタメ', '交通費', '日用品',
    '転送', '現金', 'その他', '食料品', 'サウナ/スパ', 'スポーツ', '美容', '飲み会',
    'ショッピング', '医療', '健康', '薬', '書籍', 'ゲーム', 'カメラ', '音楽', '衣類',
    '車', '自転車', '海外', '水道', '仕事', '電気', '貯金'
  );
