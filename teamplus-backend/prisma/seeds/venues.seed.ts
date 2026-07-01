/**
 * 링크장(Venue) 시드 — 대한빙상경기연맹 '지역별 링크장 찾기' 전국 목록 + 유소년 하키 특화 8곳
 *
 * 실행:
 *   npm run seed:venues
 *   (또는) npx tsx prisma/seeds/venues.seed.ts
 *
 * 멱등성:
 *   링크장 '이름'(공백 정규화) 또는 alias 키워드로 기존 레코드를 찾아
 *   존재하면 update, 없으면 create. 재실행해도 중복 생성되지 않는다.
 *   (예: 기존 "목동 아이스링크"·"인천 선학 국제빙상경기장"·"고양 어울림누리 빙상장"은
 *        alias/정규화 매칭으로 갱신되며 새 행이 생기지 않음.)
 *
 * ⚠️ 대표 사진:
 *   imageUrl 은 `/uploads/venues/*.jpg` 상대경로다. 이 시드는 DB 행만 넣으므로,
 *   서버의 업로드 루트(UPLOAD_ROOT/venues/ · 기본 <workspace>/uploads/venues/)에
 *   동일 파일 7종이 있어야 사진이 표시된다.
 *   `/uploads/` 는 런타임 업로드 경로라 저장소 추적 대상이 아니므로 전체 gitignore 된다.
 *   따라서 이미지는 git 이 아니라 각 서버의 UPLOAD_ROOT/venues/ 에 직접 배포한다.
 *   (덧붙여 이 사진들은 제3자 저작이므로 배포·사용 시 별도 주의.)
 *   로컬은 파일이 없으면 placeholder 로 표시된다.
 *   (파일: zenith / mokdong / korea-univ / icehouse / tancheon / blackice / waves-gimpo .jpg)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const norm = (s: string | null | undefined) => (s || '').replace(/\s+/g, '');
const phone = (s: string | null | undefined) =>
  s ? s.replace(/\)/g, '-').replace(/~\d+$/, '').replace(/\s+/g, '') : null;

const IMG = (f: string) => `/uploads/venues/${f}`;

interface VenueSeed {
  name: string;
  city: string;
  address?: string | null;
  phone?: string | null;
  /** 대표 사진 상대경로 (7곳만) */
  image?: string | null;
  /** 소개(한 문장) — 유소년 하키 특화 8곳만 */
  description?: string;
  /** 기존 레코드 중복 매칭용 키워드(정규화 이름 불일치 케이스) */
  alias?: string;
}

// 소개는 한 문장(간략). 사진 7종(광운대 제외).
const SEED: VenueSeed[] = [
  // ── 유소년 하키 특화 8곳 (소개/사진) ──
  { name: '제니스아이스링크', city: '서울', address: '서울특별시 구로구 안양천로539길 11', phone: '02)2619-7000', image: IMG('zenith.jpg'), description: '수도권 유소년 아이스하키 클럽들의 거점으로, 국제 규격 메인 링크와 하프·미니 링크를 갖춘 하키 특화 링크장입니다.', alias: '제니스' },
  { name: '목동아이스링크', city: '서울', address: '서울특별시 양천구 안양천로 939', phone: '02)2649-8454', image: IMG('mokdong.jpg'), description: '국제 규격 링크를 갖춘 대한민국 빙상 스포츠의 산실로, 유소년 아이스하키 대회가 자주 열리는 중심지입니다.', alias: '목동' },
  { name: '고려대학교 아이스링크', city: '서울', address: '서울특별시 성북구 안암로 145', phone: '02)3290-4243', image: IMG('korea-univ.jpg'), description: '사계절 우수한 빙질을 유지하는 대학 링크로, 강북·성북권 유소년 하키 클럽들이 즐겨 이용하는 곳입니다.' },
  { name: '광운대학교 아이스링크장', city: '서울', address: '서울특별시 노원구 광운로 21', phone: '02)909-3114', image: null, description: '최근 리뉴얼로 재개장한 광운대 하키팀 홈 링크로, 경기 북부·서울 동북권 유소년 클럽의 거점입니다.' },
  { name: '아이스하우스 아이스링크', city: '경기', address: '경기도 수원시 권선구 탑동 512', phone: '031)296-3443', image: IMG('icehouse.jpg'), description: '경기 남부 유소년 하키의 메카로, 회원제 강습과 클럽 대관 위주로 운영되는 국제 규격 링크장입니다.' },
  { name: '탄천종합운동장 빙상장', city: '경기', address: '경기도 성남시 분당구 탄천로 215', phone: '031)725-7120', image: IMG('tancheon.jpg'), description: '성남·분당권 유소년 하키 클럽들이 애용하는, 시가 관리하는 대형 공공 빙상 시설입니다.' },
  { name: '블랙아이스', city: '경기', address: '경기도 남양주시', phone: null, image: IMG('blackice.jpg'), description: '남양주 강변북로 인근의 프리미엄 미니 링크로, 저연령 유소년의 기초 스케이팅·하키 레슨에 최적화되어 있습니다.' },
  { name: '웨이브즈아이스링크 김포점', city: '경기', address: '경기도 김포시 김포한강11로 218 굿프라임스포츠몰 6층', phone: '070-4413-0701', image: IMG('waves-gimpo.jpg'), description: '김포 한강신도시권 유소년 하키 클럽들이 이용하는, 소그룹 맞춤 대관에 특화된 프리미엄 사설 링크장입니다.' },

  // ── 사이트 전국 나머지 (소개/사진 없음) ──
  { name: '강릉 실내빙상장', city: '강원', address: '강원도 강릉시 교2동 630-4', phone: '033)647-8688' },
  { name: '춘천 의암빙상장', city: '강원', address: '강원도 춘천시 송암동 700-3', phone: '033)263-7302' },
  { name: '울산과학대 실내빙상장', city: '울산', address: '울산광역시 동구 화정동 산160-1', phone: '052)230-0656' },
  { name: '인천 선학빙상장', city: '인천', address: '인천광역시 연수구 경원대로 526', phone: '032)821-5723', alias: '선학' },
  { name: '광양 부영 국제빙상장', city: '전남', address: '전남 광양시 광양읍 덕례리 541-1', phone: '061)761-8600' },
  { name: '전주 실내빙상경기장', city: '전북', address: '전주시 완산구 중화산동2가', phone: '063)239-2535' },
  { name: '제주 브랭섬홀아시아빙상', city: '제주', address: '제주특별자치도 서귀포시 대정읍 글로벌에듀로 234', phone: '0507)1436-1293' },
  { name: '아산 이순신 빙상장', city: '충남', address: '충남 아산시 남부로 370-42', phone: '0507)1404-3771' },
  { name: '청주 실내빙상장', city: '충북', address: '충북 청주시 밀레니엄1로(사천동)', phone: '043)270-7317' },
  { name: '과천시민회관 아이스링크', city: '경기', address: '경기도 과천시 중앙동 6-2', phone: '02)500-1321' },
  { name: '분당올림픽 스포츠센터 아이스링크', city: '경기', address: '경기도 성남시 분당구 서현동 90', phone: '031)708-7485' },
  { name: '안양 실내빙상장', city: '경기', address: '경기도 안양시 동안구 비산3동 1023', phone: '031)389-5228' },
  { name: '고양 어울림누리 빙상장', city: '경기', address: '경기도 고양시 덕양구 어울림로 33', phone: '031)960-0300', alias: '어울림' },
  { name: '의정부 실내빙상장', city: '경기', address: '경기도 의정부시 체육로 136', phone: '031)828-4855' },
  { name: '유앤아이센터 빙상장', city: '경기', address: '경기도 화성시 병점동 734', phone: '031)267-8727' },
  { name: '김해 시민회관빙상장', city: '경남', address: '경남 김해시 내동 1131', phone: '055)320-1245' },
  { name: '창원 의창스포츠센터빙상장', city: '경남', address: '경남 창원시 의창구 원이대로56번길 11', phone: '055)712-0824' },
  { name: '창원 성산스포츠센터빙상장', city: '경남', address: '경남 창원시 창이대로 888', phone: '0507)333-0222' },
  { name: '포항 아이스링크장', city: '경북', address: '경북 포항시 북구 침촌마을길 36', phone: '0507)1420-0091' },
  { name: '구미 금오랜드 아이스링크', city: '경북', address: '경북 구미시 금오산로 339', phone: '0507)1358-8505' },
  { name: '광주 염주 아이스링크', city: '광주', address: '광주시 서구 풍암동 415-21', phone: '062)380-6881' },
  { name: '대구 실내빙상장', city: '대구', address: '대구시 북구 고성로 191', phone: '053)357-6021' },
  { name: '대구 이월드 83타워 아이스링크장', city: '대구', address: '대구시 달서구 두류공원로 200', phone: '053)620-0200' },
  { name: '대구 아르떼수성랜드 아이스링크장', city: '대구', address: '대구시 수성구 용학로 35-5', phone: '053)765-1300' },
  { name: '대전 남선공원 빙상장', city: '대전', address: '대전시 서구 남선로 66', phone: '042)488-5605' },
  { name: '부산 실내빙상장', city: '부산', address: '부산광역시 북구 금곡대로46번길 50', phone: '051)377-4087' },
  { name: '부산 신세계 센텀시티 아이스링크장', city: '부산', address: '부산광역시 해운대구 센텀남대로 35', phone: '051)745-1400' },
  { name: '부산 동래아이스링크', city: '부산', address: '부산광역시 동래구 충렬대로 420', phone: '051)529-7110' },
  { name: '부산광역시 남구 빙상장', city: '부산', address: '부산광역시 남구 백운포로 110', phone: '051)601-3433' },
  { name: '롯데월드 아이스링크', city: '서울', address: '서울시 송파구 올림픽로 240', phone: '02)1661-2000' },
  { name: '한국체육대학교 실내빙상장', city: '서울', address: '서울시 송파구 양재대로 1239', phone: '02)410-6777' },
  { name: '동천재활체육센터 동천빙상경기장', city: '서울', address: '서울시 노원구 노원로18길 41', phone: '02)949-9114' },
];

async function main() {
  const existing = await prisma.venue.findMany({ select: { id: true, name: true } });
  const findExisting = (s: VenueSeed) =>
    existing.find(
      (e) => norm(e.name) === norm(s.name) || (s.alias ? norm(e.name).includes(s.alias) : false),
    );

  let created = 0;
  let updated = 0;

  for (const s of SEED) {
    const hit = findExisting(s);
    const data: Record<string, unknown> = {
      name: s.name,
      city: s.city,
      address: s.address ?? null,
      phone: phone(s.phone),
      status: 'active',
    };
    if (s.image !== undefined) data.imageUrl = s.image;
    if (s.description !== undefined) data.description = s.description;

    if (hit) {
      // 기존 레코드는 '이름'을 보존한다 — 운영자가 admin 에서 링크장명을 손봤을 수 있으므로
      //   (예: "제니스아이스링크" → "고척제니스 아이스링크") 재실행이 이를 덮어쓰지 않는다.
      const { name: _omitName, ...updateData } = data;
      await prisma.venue.update({ where: { id: hit.id }, data: updateData });
      updated++;
      console.log(`  [update] ${hit.name}`);
    } else {
      await prisma.venue.create({ data: data as never });
      created++;
      console.log(`  [create] ${s.name}${s.image ? ' 📷' : ''}`);
    }
    // 신규 생성분도 이후 중복 매칭에 반영
    if (!hit) existing.push({ id: 'new', name: s.name });
  }

  const total = await prisma.venue.count();
  console.log(`\n✅ 링크장 시드 완료 — 생성 ${created} · 갱신 ${updated} · 전체 ${total}`);
}

main()
  .catch((e) => {
    console.error('❌ 링크장 시드 실패:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
