const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const categories = [
  { code: 'ICE-HKY', name: '아이스하키', level: 1, displayOrder: 1 },
  { code: 'ICE-HKY-EQP', name: '장비', level: 2, parentCode: 'ICE-HKY', displayOrder: 1 },
  { code: 'ICE-HKY-ACC', name: '액세서리', level: 2, parentCode: 'ICE-HKY', displayOrder: 2 },
  { code: 'ICE-HKY-TRN', name: '훈련/기타', level: 2, parentCode: 'ICE-HKY', displayOrder: 3 },
  { code: 'ICE-HKY-EQP-STK', name: '스틱', level: 3, parentCode: 'ICE-HKY-EQP', displayOrder: 1 },
  { code: 'ICE-HKY-EQP-SKT', name: '스케이트', level: 3, parentCode: 'ICE-HKY-EQP', displayOrder: 2 },
  { code: 'ICE-HKY-EQP-BAG', name: '가방', level: 3, parentCode: 'ICE-HKY-EQP', displayOrder: 3 },
  { code: 'ICE-HKY-ACC-TAPE', name: '테이프/그립', level: 3, parentCode: 'ICE-HKY-ACC', displayOrder: 1 },
  { code: 'ICE-HKY-TRN-GOAL', name: '골대/네트', level: 3, parentCode: 'ICE-HKY-TRN', displayOrder: 1 },
  { code: 'ICE-HKY-EQP-STK-ENTRY', name: '입문/연습용', level: 4, parentCode: 'ICE-HKY-EQP-STK', displayOrder: 1 },
  { code: 'ICE-HKY-EQP-STK-COMP', name: '컴포지트', level: 4, parentCode: 'ICE-HKY-EQP-STK', displayOrder: 2 },
  { code: 'ICE-HKY-EQP-SKT-ADULT', name: '성인', level: 4, parentCode: 'ICE-HKY-EQP-SKT', displayOrder: 1 },
  { code: 'ICE-HKY-EQP-BAG-GEAR', name: '장비백/캐리어', level: 4, parentCode: 'ICE-HKY-EQP-BAG', displayOrder: 1 },
  { code: 'ICE-HKY-ACC-TAPE-STRAP', name: '스트랩/그립', level: 4, parentCode: 'ICE-HKY-ACC-TAPE', displayOrder: 1 },
  { code: 'ICE-HKY-TRN-GOAL-NET', name: '골대망', level: 4, parentCode: 'ICE-HKY-TRN-GOAL', displayOrder: 1 },
];

const products = [
  {
    code: 'CPG-8937117899',
    name: '루오우 아이스하키 스틱 하키 게이트볼 하키스틱',
    categoryCode: 'ICE-HKY-EQP-STK-ENTRY',
    price: 66000,
    source: 'Coupang',
    url: 'https://www.coupang.com/vp/products/8937117899',
  },
  {
    code: 'CPG-8522103665',
    name: 'CCM 아이스하키 스틱 RIBCOR TRIGGER 8PRO',
    categoryCode: 'ICE-HKY-EQP-STK-COMP',
    price: 662200,
    salePrice: 486300,
    brand: 'CCM',
    source: 'Coupang',
    url: 'https://www.coupang.com/vp/products/8522103665',
  },
  {
    code: 'CPG-8505508582',
    name: '아이스하키 스틱 테이프 스트랩 레인보우 그립',
    categoryCode: 'ICE-HKY-ACC-TAPE-STRAP',
    price: 33300,
    source: 'Coupang',
    url: 'https://www.coupang.com/vp/products/8505508582',
  },
  {
    code: 'CPG-9301816720',
    name: '하키용품 아이스하키 스틱 하키스틱 에어하키 연습 하키',
    categoryCode: 'ICE-HKY-EQP-STK-ENTRY',
    price: 63900,
    source: 'Coupang',
    url: 'https://www.coupang.com/vp/products/9301816720',
  },
  {
    code: '11ST-462659026',
    name: '아이스하키 캐리어 트롤리 가방 하키가방 장비백',
    categoryCode: 'ICE-HKY-EQP-BAG-GEAR',
    price: 133970,
    source: '11st',
    url: 'https://www.11st.co.kr/catalog/462659026',
  },
  {
    code: '11ST-466526213',
    name: '아이스하키 골대 망 튼튼한 교체 풋살 메쉬 네트',
    categoryCode: 'ICE-HKY-TRN-GOAL-NET',
    price: 25810,
    source: '11st',
    url: 'https://www.11st.co.kr/catalog/466526213',
  },
  {
    code: '11ST-458013036',
    name: '스피드 스케이트화 아이스하키 피겨스케이팅 쇼트트랙 인라인',
    categoryCode: 'ICE-HKY-EQP-SKT-ADULT',
    price: 112920,
    source: '11st',
    url: 'https://www.11st.co.kr/products/458013036',
  },
  // G마켓/네이버쇼핑 등은 자동 크롤링 접근 제한으로 데이터 확보 불가.
];

const staleProductCodes = [
  'CPG-7621677182',
  'CPG-8694272063',
  'CPG-8605925864',
  'CPG-8937120067',
  'GMK-3910342309',
  'GMK-4006673764',
  'GMK-4105845876',
];

async function main() {
  console.log('🏒 아이스하키 쇼핑몰 카테고리/상품 시드 시작...');

  const codeToId = new Map();
  const codeToPath = new Map();

  const sortedCategories = [...categories].sort((a, b) => {
    if (a.level !== b.level) return a.level - b.level;
    return a.displayOrder - b.displayOrder;
  });

  for (const category of sortedCategories) {
    const parentId = category.parentCode ? codeToId.get(category.parentCode) || null : null;
    const parentPath = category.parentCode ? codeToPath.get(category.parentCode) || null : null;
    const path = parentPath ? `${parentPath} > ${category.name}` : category.name;

    const data = {
      name: category.name,
      code: category.code,
      parentId,
      level: category.level,
      path,
      displayOrder: category.displayOrder,
      isActive: true,
      description: category.description || null,
    };

    const saved = await prisma.shopCategory.upsert({
      where: { code: category.code },
      update: data,
      create: data,
    });

    codeToId.set(category.code, saved.id);
    codeToPath.set(category.code, path);
  }

  if (staleProductCodes.length > 0) {
    const removed = await prisma.shopProduct.deleteMany({
      where: { code: { in: staleProductCodes } },
    });
    if (removed.count > 0) {
      console.log(`🧹 기존 상품 ${removed.count}개 정리 완료`);
    }
  }

  let created = 0;
  let updated = 0;

  for (const product of products) {
    const categoryId = codeToId.get(product.categoryCode);
    if (!categoryId) {
      throw new Error(`카테고리를 찾을 수 없음: ${product.categoryCode}`);
    }

    const description = `출처: ${product.source} | URL: ${product.url}`;
    const existing = await prisma.shopProduct.findUnique({ where: { code: product.code } });

    await prisma.shopProduct.upsert({
      where: { code: product.code },
      update: {
        name: product.name,
        categoryId,
        price: product.price,
        salePrice: product.salePrice || null,
        description,
        brand: product.brand || null,
        isActive: true,
      },
      create: {
        name: product.name,
        code: product.code,
        categoryId,
        description,
        price: product.price,
        salePrice: product.salePrice || null,
        brand: product.brand || null,
        stock: 0,
        minOrderQty: 1,
        isActive: true,
      },
    });

    if (existing) {
      updated += 1;
    } else {
      created += 1;
    }
  }

  console.log(`✅ 카테고리 ${sortedCategories.length}개 upsert 완료`);
  console.log(`✅ 상품 ${created}개 생성, ${updated}개 업데이트`);
  console.log('🎉 시드 완료');
}

main()
  .catch((error) => {
    console.error('❌ 시드 실행 중 오류:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
