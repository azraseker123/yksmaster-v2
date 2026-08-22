// 2026 YKS curriculum navigation dataset.
// Source basis: MEB Talim ve Terbiye Kurulu 2026 YKS konu/kazanım duyurusu and
// MEB/OGM MEBİ TYT-AYT subject materials. Labels are normalized for checklist UX;
// they do not invent non-curriculum social-science topics.
export const CURRICULUM_META = {
  year: 2026,
  officialAnnouncement: 'https://ttkb.meb.gov.tr/www/osym-tarafindan-2026-yilinda-gerceklestirilecek-quotyuksekogretim-kurumlari-sinavi-yksquotna-esas-derslere-ait-konu-ve-kazanimlar/icerik/831/tr',
  officialPdf: 'https://ttkb.meb.gov.tr/meb_iys_dosyalar/2025_11/26164023_2026_yks.pdf',
  note: '2026 YKS için TTKB tarafından yayımlanan kazanım ve açıklama kapsamı esas alınarak takip ekranı için konu grupları oluşturulmuştur.'
};

const slug = value => value.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i').replace(/ş/g,'s').replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ö/g,'o').replace(/ç/g,'c').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const t = (...items) => items.map(name => ({ id: slug(name), name }));

export const TYT = {
  'Türkçe': t(
    'Sözcükte Anlam','Cümlede Anlam','Paragrafta Anlam ve Yapı','Ses Bilgisi','Yazım Kuralları','Noktalama İşaretleri',
    'Sözcükte Yapı','Sözcük Türleri','İsim ve Sıfat Tamlamaları','Fiiller ve Ek Fiil','Fiilimsiler','Fiilde Çatı',
    'Cümlenin Ögeleri','Cümle Türleri','Anlatım Bozuklukları'
  ),
  'Matematik': t(
    'Temel Kavramlar','Sayı Basamakları','Bölme ve Bölünebilme','EBOB ve EKOK','Rasyonel Sayılar','Basit Eşitsizlikler',
    'Mutlak Değer','Üslü İfadeler','Köklü İfadeler','Çarpanlara Ayırma','Oran ve Orantı','Denklemler','Problemler',
    'Kümeler ve Kartezyen Çarpım','Mantık','Fonksiyonlara Giriş','Veri, İstatistik ve Grafik','Permütasyon, Kombinasyon ve Olasılık',
    'Açı Kavramı ve Üçgenler','Üçgenlerde Benzerlik ve Alan','Dörtgenler ve Çokgenler','Çember ve Daire','Analitik Geometriye Giriş',
    'Dik Üçgende Trigonometrik Oranlar ve Birim Çember','Katı Cisimler'
  ),
  'Tarih': t(
    'Tarih ve Zaman','İnsanlığın İlk Dönemleri','Orta Çağ’da Dünya','İlk ve Orta Çağlarda Türk Dünyası','İslam Medeniyetinin Doğuşu',
    'Türklerin İslamiyet’i Kabulü ve İlk Türk İslam Devletleri','Yerleşme ve Devletleşme Sürecinde Selçuklu Türkiyesi',
    'Beylikten Devlete Osmanlı Siyaseti','Dünya Gücü Osmanlı','Değişen Dünya Dengeleri Karşısında Osmanlı',
    'Değişim Çağında Avrupa ve Osmanlı','Uluslararası İlişkilerde Denge Stratejisi','XX. Yüzyıl Başlarında Osmanlı Devleti ve Dünya',
    'Millî Mücadele','Atatürkçülük ve Türk İnkılabı'
  ),
  'Coğrafya': t(
    'Doğa ve İnsan','Coğrafi Konum','Harita Bilgisi','Dünya’nın Şekli ve Hareketleri','Atmosfer ve İklim','Yer Şekilleri',
    'Su, Toprak ve Bitkiler','Nüfus ve Yerleşme','Göç','Ekonomik Faaliyetler','Bölgeler','Türkiye’nin Coğrafi Özellikleri','Afetler ve Çevre'
  ),
  'Felsefe': t(
    'Felsefeyi Tanıma','Felsefe ile Düşünme','Varlık Felsefesi','Bilgi Felsefesi','Bilim Felsefesi','Ahlak Felsefesi',
    'Din Felsefesi','Siyaset Felsefesi','Sanat Felsefesi','Felsefe Tarihinin Temel Dönemleri'
  ),
  'Din Kültürü': t(
    'Bilgi ve İnanç','Din ve İslam','İslam ve İbadet','Gençlik ve Değerler','Gönül Coğrafyamız','Allah-İnsan İlişkisi',
    'Hz. Muhammed ve Gençlik','Din ve Hayat','Ahlaki Tutum ve Davranışlar','İslam Düşüncesinde Yorumlar','Dünya ve Ahiret',
    'Kur’an’a Göre Hz. Muhammed','İnançla İlgili Meseleler','Yahudilik ve Hristiyanlık','Hint ve Çin Dinleri'
  ),
  'Fizik': t(
    'Fizik Bilimine Giriş','Madde ve Özellikleri','Hareket ve Kuvvet','İş, Güç ve Enerji','Isı, Sıcaklık ve Genleşme',
    'Elektrostatik','Elektrik ve Manyetizma','Basınç','Kaldırma Kuvveti','Dalgalar','Optik'
  ),
  'Kimya': t(
    'Kimya Bilimi','Atom ve Periyodik Sistem','Kimyasal Türler Arası Etkileşimler','Maddenin Hâlleri','Doğa ve Kimya',
    'Kimyanın Temel Kanunları ve Kimyasal Hesaplamalar','Karışımlar','Asitler, Bazlar ve Tuzlar','Kimya Her Yerde'
  ),
  'Biyoloji': t(
    'Yaşam Bilimi Biyoloji','Canlıların Yapısında Bulunan Temel Bileşikler','Hücre','Canlıların Çeşitliliği ve Sınıflandırılması',
    'Hücre Bölünmeleri ve Üreme','Kalıtımın Genel İlkeleri','Ekosistem Ekolojisi','Güncel Çevre Sorunları ve İnsan'
  )
};

export const AYT = {
  'Matematik': t(
    'Fonksiyonlar','Polinomlar','İkinci Dereceden Denklemler ve Eşitsizlikler','Karmaşık Sayılar','Permütasyon, Kombinasyon, Binom ve Olasılık',
    'Trigonometri','Üstel ve Logaritmik Fonksiyonlar','Diziler','Limit ve Süreklilik','Türev','İntegral','Analitik Geometri','Çember ve Daire'
  ),
  'Fizik': t(
    'Vektörler','Kuvvet, Tork ve Denge','Kütle Merkezi','Hareket','Newton’un Hareket Yasaları','İş, Enerji ve İtme-Momentum',
    'Elektriksel Kuvvet, Potansiyel ve Sığa','Manyetizma ve Elektromanyetik İndüksiyon','Alternatif Akım ve Transformatörler',
    'Çembersel Hareket','Dönme, Yuvarlanma ve Açısal Momentum','Kütle Çekim ve Kepler Yasaları','Basit Harmonik Hareket',
    'Dalga Mekaniği ve Elektromanyetik Dalgalar','Atom Fiziğine Giriş ve Radyoaktivite','Modern Fizik','Modern Fiziğin Teknolojideki Uygulamaları'
  ),
  'Kimya': t(
    'Modern Atom Teorisi','Gazlar','Sıvı Çözeltiler ve Çözünürlük','Kimyasal Tepkimelerde Enerji','Kimyasal Tepkimelerde Hız',
    'Kimyasal Tepkimelerde Denge','Asit-Baz Dengesi','Çözünürlük Dengesi','Kimya ve Elektrik','Karbon Kimyasına Giriş',
    'Organik Bileşikler','Enerji Kaynakları ve Bilimsel Gelişmeler'
  ),
  'Biyoloji': t(
    'İnsan Fizyolojisi','Komünite ve Popülasyon Ekolojisi','Genden Proteine','Canlılarda Enerji Dönüşümleri','Bitki Biyolojisi',
    'Canlılar ve Çevre'
  ),
  'Türk Dili ve Edebiyatı': t(
    'Edebiyatın Temel Kavramları ve Türk Edebiyatının Dönemleri','Şiir Bilgisi ve Söz Sanatları','İslamiyet Öncesi Türk Edebiyatı',
    'Geçiş Dönemi Türk Edebiyatı','Halk Edebiyatı','Divan Edebiyatı','Tanzimat Dönemi Türk Edebiyatı','Servetifünun ve Fecriati',
    'Millî Edebiyat','Cumhuriyet Dönemi Türk Şiiri','Cumhuriyet Dönemi Hikâye ve Romanı','Tiyatro','Öğretici Metin Türleri','Edebî Akımlar'
  ),
  'Tarih-1': t(
    'Değişen Dünya Dengeleri Karşısında Osmanlı Siyaseti','Değişim Çağında Avrupa ve Osmanlı','Uluslararası İlişkilerde Denge Stratejisi',
    'Devrimler Çağında Değişen Devlet-Toplum İlişkileri','Sermaye ve Emek','XIX ve XX. Yüzyılda Değişen Gündelik Hayat',
    'XX. Yüzyıl Başlarında Osmanlı Devleti ve Dünya','Millî Mücadele','Atatürkçülük ve Türk İnkılabı'
  ),
  'Coğrafya-1': t(
    'Ekosistemlerin Özellikleri ve İşleyişi','Nüfus Politikaları ve Türkiye’nin Nüfus Projeksiyonları','Şehirlerin Fonksiyonları ve Etki Alanları',
    'Türkiye’de Yerleşmeler','Ekonomik Faaliyetler ve Doğal Kaynaklar','Türkiye Ekonomisi','Kültür Bölgeleri ve Küreselleşme',
    'Uluslararası Ulaşım Hatları','Bölgeler ve Ülkeler','Çevre Sorunları ve Sürdürülebilirlik'
  ),
  'Tarih-2': t(
    'İlk Çağ ve Orta Çağ Uygarlıkları','Türklerin Tarih Sahnesine Çıkışı','İslam Tarihi ve Medeniyeti','Türk-İslam Devletleri',
    'Osmanlı Devleti’nin Kuruluş, Yükselme ve Değişim Süreçleri','XVII-XIX. Yüzyıl Osmanlı Siyaseti ve Toplumu',
    'XX. Yüzyıl Başlarında Osmanlı ve Dünya','Millî Mücadele ve Cumhuriyet','İki Savaş Arasındaki Dönem','II. Dünya Savaşı',
    'Soğuk Savaş Dönemi','Yumuşama Dönemi ve Sonrası','Küreselleşen Dünya'
  ),
  'Coğrafya-2': t(
    'Doğal Sistemler','Beşerî Sistemler','Türkiye’nin Coğrafi Özellikleri','Küresel Ortam: Bölgeler ve Ülkeler',
    'Ekonomik Faaliyetler ve Doğal Kaynaklar','Türkiye Ekonomisi ve Bölgesel Kalkınma','Jeopolitik Konum ve Uluslararası İlişkiler',
    'Çevre ve Toplum','Doğal Afetler ve Sürdürülebilirlik'
  ),
  'Felsefe Grubu': t(
    'Felsefenin Konusu ve Temel Problemleri','Bilgi, Varlık, Ahlak, Sanat, Din ve Siyaset Felsefesi','Felsefe Tarihinin Temel Dönemleri',
    'Psikoloji Bilimini Tanıma','Psikolojinin Temel Süreçleri','Öğrenme, Bellek ve Düşünme','Ruh Sağlığının Temelleri',
    'Sosyolojiye Giriş','Birey ve Toplum','Toplumsal Yapı, Değişme ve Kültür','Mantığa Giriş','Klasik Mantık','Sembolik Mantık'
  ),
  'Din Kültürü': t(
    'Dünya ve Ahiret','Kur’an’a Göre Hz. Muhammed','İnançla İlgili Meseleler','Yahudilik ve Hristiyanlık','Hint ve Çin Dinleri',
    'İslam ve Bilim','Anadolu’da İslam','İslam Düşüncesinde Tasavvufi Yorumlar','Güncel Dinî Meseleler'
  )
};

export const FIELD_SUBJECTS = {
  sayisal: {
    TYT: Object.keys(TYT),
    AYT: ['Matematik','Fizik','Kimya','Biyoloji']
  },
  esit_agirlik: {
    TYT: Object.keys(TYT),
    AYT: ['Matematik','Türk Dili ve Edebiyatı','Tarih-1','Coğrafya-1']
  },
  sozel: {
    TYT: Object.keys(TYT),
    AYT: ['Türk Dili ve Edebiyatı','Tarih-1','Coğrafya-1','Tarih-2','Coğrafya-2','Felsefe Grubu','Din Kültürü']
  }
};

export function getCurriculumForField(track) {
  const allowed = FIELD_SUBJECTS[track] || FIELD_SUBJECTS.sayisal;
  const pick = (source, names) => Object.fromEntries(names.map(name => [name, source[name]]).filter(([,v]) => v));
  return {
    meta: CURRICULUM_META,
    TYT: pick(TYT, allowed.TYT),
    AYT: pick(AYT, allowed.AYT)
  };
}
