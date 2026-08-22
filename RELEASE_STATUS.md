# YKS Master V2 - v2.4.0 Durum

## Uygulanan temel sistem
- Sayısal / Eşit Ağırlık / Sözel kayıt akışı
- Hedef şehir, üniversite, bölüm ve sıralama
- JWT + HttpOnly cookie ile 30 günlük oturum
- Kullanıcı bazlı veri izolasyonu
- Temel / AI Pro / Admin erişim kontrolü
- Tek kullanımlık lisans kodları
- Admin paket önizlemesi ve örnek test verisi üretimi

## Temel paket ekranları
- Bugünün Planı
- Müfredat ve tamamlanma yüzdeleri
- Manuel çalışma programı
- Deneme takibi
- Soru D/Y/B takibi
- Kaynak takibi
- Dijital yanlış soru arşivi
- Tekrar listesi
- Ders bazlı performans
- Pomodoro / manuel çalışma
- Uyku takibi
- Günlük seri
- Rozetler
- Veri tabanlı akıllı uyarılar

## AI Pro ekranları
- AI Koç
- Flashcard
- Test Lab
- 7 günlük AI çalışma programı
- Fotoğraftan soru çözme
- AI yanlış analizi
- 7 günlük arkadaş düellosu ve özel arkadaş liderliği

## Güvenlik / veri
- Gemini anahtarı yalnız backend environment variable üzerinden kullanılır
- Parametreli PostgreSQL sorguları
- bcryptjs şifre hashleme
- Başarısız giriş kilidi
- AI günlük kullanım limitleri
- Kullanıcı veri dışa aktarma
- Kullanıcı hesabı silme
- Güvenlik HTTP başlıkları

## Yayın öncesi açık kontroller
1. Resmi TTKB 2026 YKS PDF'sindeki bütün kazanım başlıklarının `data/curriculum.js` takip gruplarına karşı manuel içerik denetimi tamamlanmalı. Kod veri setinin 2026 olduğunu ve alan/route yapısını doğrular; bu kontrol içerik denetiminin yerine geçmez.
2. Yanlış soru görselleri mevcut sürümde kullanıcıya özel PostgreSQL kayıtlarında tutulur. Büyük ölçeğe çıkmadan önce private object storage'a taşınması önerilir.
3. Shopier siparişinden lisans kodunu otomatik üretip teslim etme akışı, resmi Shopier entegrasyon yöntemi kesinleştirildikten sonra bağlanmalıdır.
4. Gerçek Vercel + PostgreSQL + Gemini ortamında uçtan uca smoke test yapılmalıdır.
