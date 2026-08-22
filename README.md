# YKS Master V2

YKS Master V2; Sayısal, Eşit Ağırlık ve Sözel öğrencileri için hazırlanmış, takip araçları ile AI Pro özelliklerini aynı hesap altında birleştiren responsive YKS çalışma platformudur.

## Paketler

### Temel — 99 TL / 30 gün
- Hedef şehir, üniversite, bölüm ve sıralama profili
- 2026 YKS müfredat takibi ve tamamlanma yüzdeleri
- Bugünün Planı ve manuel çalışma programı
- Deneme takibi
- Soru / doğru / yanlış / boş takibi
- Kaynak takibi ve kaynak ilerlemesi
- Dijital yanlış soru arşivi
- Tekrar listesi
- Ders bazlı performans
- Pomodoro ve çalışma süresi
- Uyku takibi
- Günlük seri (streak)
- Rozetler
- Veri tabanlı akıllı uyarılar

Temel pakette AI programı, AI yanlış analizi ve düello yoktur.

### AI Pro — 299 TL / 30 gün
Temel paketin tamamına ek olarak:
- AI Koç
- AI Flashcard
- AI Test Lab
- 7 günlük AI çalışma programı
- Fotoğraftan soru çözme
- AI yanlış analizi
- Haftalık arkadaş düellosu ve arkadaş liderliği

### AI Pro Yıllık — 1299 TL / 365 gün
AI Pro özelliklerinin 365 günlük erişimidir.

## Öğrenci alanları

Sistem yalnızca şu alanları destekler:
- Sayısal
- Eşit Ağırlık
- Sözel

Dil öğrencisi akışı yoktur. Sistem yalnızca YKS için tasarlanmıştır; kayıt sırasında ayrıca sınav türü sorulmaz.

## Teknik yapı

- Frontend: Vanilla HTML/CSS/JavaScript SPA
- Hosting / API: Vercel Functions
- Veritabanı: PostgreSQL (`pg` ile `DATABASE_URL`)
- Kimlik doğrulama: JWT + HttpOnly cookie
- Şifre: `bcryptjs`
- AI: Google GenAI SDK (`@google/genai`) + Gemini
- Veritabanı tabloları `yks2_` öneki taşır; eski YKS Master tablolarıyla çakışmaz.

## Gerekli Vercel Environment Variables

```text
DATABASE_URL=...
JWT_SECRET=çok-uzun-rastgele-bir-değer
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.7-flash
ADMIN_EMAIL=senin-test-hesabinin-epostasi
SETUP_SECRET=çok-uzun-rastgele-bir-kurulum-anahtari
```

`GEMINI_API_KEY` frontend'e yazılmaz. AI istekleri yalnızca `/api/ai` üzerinden sunucudan yapılır.

## İlk kurulum

1. Projeyi Vercel'e deploy et.
2. Yukarıdaki Environment Variables değerlerini Production/Preview ortamlarına ekle.
3. Yeni deployment oluştur.
4. `https://SITE-ADRESIN/setup.html` sayfasını aç.
5. `SETUP_SECRET` değerini girip veritabanını kur.
6. `ADMIN_EMAIL` ile aynı e-posta adresiyle ilk hesabını oluştur.
7. Admin hesabı AI Pro erişimine sahiptir ve Ayarlar > Admin Test bölümünden Paket Yok / Temel / AI Pro görünümünü para ödemeden test edebilir.
8. Aynı Admin Test bölümündeki **Örnek Test Verisi Ekle** düğmesiyle kendi hesabına soru, deneme, çalışma, uyku, program ve müfredat örnekleri ekleyip boş ekranlarla uğraşmadan panelleri test edebilirsin. Demo veri yalnız adminin kendi hesabına eklenir ve ikinci kez eklenmez.

`/api/setup` yalnızca doğru `SETUP_SECRET` gönderildiğinde çalışır. Kurulum tamamlandıktan sonra istersen Vercel'den `SETUP_SECRET` değişkenini kaldırarak endpoint'i devre dışı bırakabilirsin.

## Lisans kodu akışı

Admin paneli üç tür tek kullanımlık kod üretebilir:
- `basic_monthly`: 30 gün Temel
- `ai_pro_monthly`: 30 gün AI Pro
- `ai_pro_yearly`: 365 gün AI Pro

Kod isteğe bağlı olarak satın alan kişinin e-posta adresine önceden bağlanabilir. Kod kullanıldığında `used_by` alanı kullanıcıya bağlanır ve ikinci kez kullanılamaz.

Shopier siparişinden sonra kodu otomatik üretip müşteriye teslim edecek entegrasyon bu sürümde henüz bağlanmamıştır. Mevcut sistem kod üretme/etkinleştirme tarafını hazırlar; Shopier otomasyonu resmi entegrasyon akışı doğrulandıktan sonra ayrıca bağlanmalıdır.

## Veri ve güvenlik notları

- Her öğrenci kaydı `user_id` ile sahibine bağlanır.
- Kullanıcı API'leri sorgularını oturumdaki kullanıcıya göre sınırlar.
- Ayarlar ekranından çalışma verilerinin JSON kopyası indirilebilir; dışa aktarma şifre hashini içermez.
- Kullanıcı kendi hesabını ve bağlı çalışma verilerini uygulama içinden kalıcı olarak silebilir.
- Oturum cookie'si `HttpOnly`, `SameSite=Lax` ve production'da `Secure` olarak ayarlanır.
- SQL sorguları parametreli yapılır.
- Kullanıcı şifreleri düz metin tutulmaz.
- Başarısız giriş denemelerinde geçici hesap kilidi bulunur.
- AI kullanımı günlük limitlidir; admin hesap bu limitten muaftır.
- API yanıtları `no-store` olarak ayarlanır.
- Güvenlik başlıkları Vercel yapılandırmasında tanımlıdır.

## Günlük seri

Streak yalnızca gerçek çalışma etkileşimlerinden ilerler: çalışma oturumu/Pomodoro, soru çözüm kaydı, deneme kaydı, tamamlanan plan görevi veya tamamlanan tekrar. Sadece müfredatta kutu işaretlemek seriyi artırmaz.

## Yanlış soru arşivi

MVP sürümünde sıkıştırılmış JPEG/PNG/WEBP görselleri PostgreSQL'de kullanıcıya özel olarak saklanır. Büyük kullanıcı sayısına geçmeden önce görsellerin obje depolamaya (ör. Vercel Blob benzeri) taşınması önerilir; arşiv tablosunda yalnızca özel dosya anahtarı tutulmalıdır.

## Geliştirici kontrolü

Kod değişikliğinden sonra:

```bash
npm run validate
```

komutu;
- 2026 veri seti yılını,
- Sayısal / EA / Sözel alanlarını,
- Dil alanının eklenmemesini,
- ders-konu ID tekrarlarını,
- zorunlu API dosyalarını,
- Temel ve AI Pro navigasyonunu,
- temel veritabanı tablolarını

statik olarak kontrol eder.

Bu kontrol resmi müfredatın içerik doğruluğunun yerine geçmez; müfredat veri seti yayın öncesinde TTKB'nin 2026 YKS konu/kazanım dokümanına karşı ayrıca içerik denetiminden geçirilmelidir.
