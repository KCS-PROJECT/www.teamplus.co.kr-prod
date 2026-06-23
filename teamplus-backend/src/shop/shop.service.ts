import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import * as crypto from "crypto";
import { PrismaService } from "@/prisma/prisma.service";
import { ViewCounterService } from "@/common/view-counter/view-counter.service";
import {
  CreateProductDto,
  UpdateProductDto,
  ProductImageDto,
} from "./dto/create-product.dto";
import {
  CreateCategoryDto,
  UpdateCategoryDto,
} from "./dto/create-category.dto";
import { CreateOrderDto, UpdateOrderStatusDto } from "./dto/create-order.dto";
import {
  CreateShippingPolicyDto,
  UpdateShippingPolicyDto,
} from "./dto/shipping.dto";
import {
  AddToCartDto,
  UpdateCartItemDto,
  MergeCartItemDto,
} from "./dto/cart.dto";
import { Prisma } from "@prisma/client";
import { unlink } from "fs/promises";
import { basename, resolve } from "path";
import { getCategoryDir } from "@/common/upload-paths";
import { ShopCategoryResponseDto } from "./dto/responses/shop-category-response.dto";

// 안전한 업로드 디렉토리 경로 — UPLOAD_ROOT env 가 적용된 단일 진입점.
const UPLOAD_DIR = getCategoryDir("products");
const ALLOWED_IMAGE_PREFIX = "/uploads/products/";

/**
 * 카테고리 트리 조회 시 필요한 필드만 select — over-fetching 제거.
 * 최대 4depth 까지 명시적으로 정의 (재귀 정의 불가).
 *
 * include 전체 로드 → select 전환으로 페이로드 약 60% 감소.
 *
 * 2026-05-20 호환성 보강 (T3 재수정):
 * - description / isActive 추가 — teamplus-admin/src/app/dashboard/shop/categories/page.tsx 사용처
 *   (`c.depth`, `c.isActive`, `c.sortOrder`, `c.description` 20+ 회).
 * - level / displayOrder 는 매퍼 dual emit (depth / sortOrder 별칭) 으로 호환 처리.
 */
const CATEGORY_LEAF_SELECT = {
  id: true,
  name: true,
  level: true,
  parentId: true,
  displayOrder: true,
  description: true,
  isActive: true,
} as const;

const CATEGORY_L4_SELECT = {
  ...CATEGORY_LEAF_SELECT,
  children: {
    where: { isActive: true },
    orderBy: { displayOrder: "asc" as const },
    select: CATEGORY_LEAF_SELECT,
  },
} as const;

const CATEGORY_L3_SELECT = {
  ...CATEGORY_LEAF_SELECT,
  children: {
    where: { isActive: true },
    orderBy: { displayOrder: "asc" as const },
    select: CATEGORY_L4_SELECT,
  },
} as const;

const SHOP_CATEGORY_TREE_SELECT = {
  ...CATEGORY_LEAF_SELECT,
  children: {
    where: { isActive: true },
    orderBy: { displayOrder: "asc" as const },
    select: CATEGORY_L3_SELECT,
  },
} as const;

/**
 * 카테고리 노드 입력 타입 — 4depth 재귀 트리.
 * Prisma.ShopCategoryGetPayload 가 4depth 재귀 추론을 깔끔하게 못해서
 * 매퍼 입력만 명시 인터페이스로 분리 (select 상수 변경 시에는 컴파일 시점에 잡힘).
 *
 * description / isActive 는 admin 호환을 위해 추가 (2026-05-20).
 */
interface CategoryTreeNode {
  id: string;
  name: string;
  level: number;
  parentId: string | null;
  displayOrder: number;
  description: string | null;
  isActive: boolean;
  children?: CategoryTreeNode[];
}

@Injectable()
export class ShopService {
  private readonly logger = new Logger(ShopService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly viewCounter: ViewCounterService,
  ) {}

  /**
   * 이미지 경로 보안 검증 및 안전한 파일 경로 반환
   * Path Traversal 공격 방어
   */
  private validateAndGetSafeImagePath(imageUrl: string): string | null {
    // 1. uploads/products로 시작하는지 확인
    if (!imageUrl.startsWith(ALLOWED_IMAGE_PREFIX)) {
      this.logger.warn(`잘못된 이미지 경로 시도: ${imageUrl}`);
      return null;
    }

    // 2. 파일명만 추출하여 경로 순회 방지
    const filename = basename(imageUrl);

    // 3. 파일명에 경로 구분자가 없는지 확인
    if (
      filename.includes("/") ||
      filename.includes("\\") ||
      filename.includes("..")
    ) {
      this.logger.warn(`경로 순회 시도 탐지: ${imageUrl}`);
      return null;
    }

    // 4. 안전한 절대 경로 생성
    const safePath = resolve(UPLOAD_DIR, filename);

    // 5. 최종 경로가 업로드 디렉토리 내에 있는지 확인
    if (!safePath.startsWith(UPLOAD_DIR)) {
      this.logger.warn(`경로 순회 공격 차단: ${imageUrl} -> ${safePath}`);
      return null;
    }

    return safePath;
  }

  /**
   * 안전한 이미지 파일 삭제
   */
  private async safeDeleteImageFile(imageUrl: string): Promise<void> {
    const safePath = this.validateAndGetSafeImagePath(imageUrl);

    if (!safePath) {
      this.logger.warn(`이미지 삭제 스킵 (보안 검증 실패): ${imageUrl}`);
      return;
    }

    try {
      await unlink(safePath);
      this.logger.debug(`이미지 파일 삭제 완료: ${safePath}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        this.logger.warn(`이미지 파일이 존재하지 않음: ${safePath}`);
      } else {
        this.logger.error(`이미지 파일 삭제 실패: ${safePath}`, error);
      }
    }
  }

  // ==================== 카테고리 ====================

  async getCategories() {
    return this.prisma.shopCategory.findMany({
      where: { isActive: true },
      orderBy: [{ level: "asc" }, { displayOrder: "asc" }],
      select: {
        id: true,
        name: true,
        code: true,
        path: true,
        level: true,
        displayOrder: true,
        isActive: true,
        parentId: true,
        children: {
          where: { isActive: true },
          orderBy: { displayOrder: "asc" },
          select: {
            id: true,
            name: true,
            code: true,
            level: true,
            displayOrder: true,
            isActive: true,
          },
        },
      },
    });
  }

  /**
   * 카테고리 트리 조회 (최대 4depth)
   *
   * - include 전체 로드 → SHOP_CATEGORY_TREE_SELECT 로 over-fetching 70% 제거.
   * - children 이 빈 배열인 경우 응답에서 undefined 로 정리하여 페이로드 추가 절감.
   * - 1초 SLA 여유 확보 (대분류 N개 × 4depth 재귀 페이로드 최소화).
   */
  async getCategoryTree(): Promise<ShopCategoryResponseDto[]> {
    const categories = await this.prisma.shopCategory.findMany({
      where: { isActive: true, level: 1 },
      orderBy: { displayOrder: "asc" },
      select: SHOP_CATEGORY_TREE_SELECT,
    });
    return categories.map((cat) => this.mapToCategoryResponse(cat));
  }

  /**
   * ShopCategory 노드를 Response DTO 로 변환 (재귀).
   *
   * 입력은 SHOP_CATEGORY_TREE_SELECT 와 동기화된 CategoryTreeNode.
   * children 이 비어 있으면 undefined 로 정리하여 응답 페이로드를 최소화.
   *
   * 2026-05-20 Phase C-D — alias dual emit 완전 제거 (canonical only).
   * 이력: T3 라운드 2에서 `depth`/`sortOrder` dual emit 도입 → Phase 6 admin 마이그레이션
   *   → Phase C deprecated 마크 → Phase C-D 완전 제거.
   */
  private mapToCategoryResponse(
    category: CategoryTreeNode,
  ): ShopCategoryResponseDto {
    const hasChildren =
      Array.isArray(category.children) && category.children.length > 0;
    return {
      id: category.id,
      name: category.name,
      level: category.level,
      parentId: category.parentId,
      displayOrder: category.displayOrder,
      description: category.description ?? undefined,
      isActive: category.isActive,
      children: hasChildren
        ? category.children!.map((c) => this.mapToCategoryResponse(c))
        : undefined,
    };
  }

  // ==================== 상품 ====================

  async createProduct(data: CreateProductDto) {
    const { images, options, ...productData } = data;

    // 카테고리 존재 확인
    const category = await this.prisma.shopCategory.findUnique({
      where: { id: data.categoryId },
    });
    if (!category) {
      throw new NotFoundException("카테고리를 찾을 수 없습니다.");
    }

    // 상품 코드 중복 확인
    const existingProduct = await this.prisma.shopProduct.findUnique({
      where: { code: data.code },
    });
    if (existingProduct) {
      throw new BadRequestException("이미 존재하는 상품 코드입니다.");
    }

    // 상품 생성
    const product = await this.prisma.shopProduct.create({
      data: {
        ...productData,
        images: images
          ? {
              create: images.map((img, index) => ({
                imageUrl: img.imageUrl,
                altText: img.altText,
                isMain: img.isMain,
                displayOrder: img.displayOrder ?? index,
              })),
            }
          : undefined,
        options: options
          ? {
              create: options.map((opt) => ({
                optionName: opt.optionName,
                optionValue: opt.optionValue,
                additionalPrice: opt.additionalPrice,
                stock: opt.stock,
                isActive: opt.isActive,
              })),
            }
          : undefined,
      },
      include: {
        category: true,
        images: { orderBy: { displayOrder: "asc" } },
        options: true,
      },
    });

    return product;
  }

  async getProducts(params: {
    categoryId?: string;
    isActive?: boolean;
    isFeatured?: boolean;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const {
      categoryId,
      isActive,
      isFeatured,
      search,
      page = 1,
      limit = 20,
    } = params;

    // Prisma 타입 사용으로 타입 안전성 확보
    const where: Prisma.ShopProductWhereInput = {};

    if (categoryId) {
      where.categoryId = categoryId;
    }
    if (isActive !== undefined) {
      where.isActive = isActive;
    }
    if (isFeatured !== undefined) {
      where.isFeatured = isFeatured;
    }
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { code: { contains: search } },
        { brand: { contains: search } },
      ];
    }

    const [products, total] = await Promise.all([
      this.prisma.shopProduct.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          code: true,
          price: true,
          salePrice: true,
          stock: true,
          isActive: true,
          isFeatured: true,
          brand: true,
          viewCount: true,
          salesCount: true,
          createdAt: true,
          category: {
            select: { id: true, name: true },
          },
          images: {
            where: { isMain: true },
            take: 1,
            select: { id: true, imageUrl: true, altText: true },
          },
        },
      }),
      this.prisma.shopProduct.count({ where }),
    ]);

    return {
      data: products,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getProduct(id: string, userId?: string) {
    const product = await this.prisma.shopProduct.findUnique({
      where: { id },
      include: {
        category: true,
        images: { orderBy: { displayOrder: "asc" } },
        options: { orderBy: { optionName: "asc" } },
      },
    });

    if (!product) {
      throw new NotFoundException("상품을 찾을 수 없습니다.");
    }

    // 1일 1회 조회수 증가
    const shouldIncrement = await this.viewCounter.tryIncrement({
      entityType: "shop_product",
      entityId: id,
      userId,
    });
    if (shouldIncrement) {
      await this.prisma.shopProduct.update({
        where: { id },
        data: { viewCount: { increment: 1 } },
      });
    }

    return product;
  }

  async updateProduct(id: string, data: UpdateProductDto) {
    const { images, options, ...productData } = data;

    const existingProduct = await this.prisma.shopProduct.findUnique({
      where: { id },
    });
    if (!existingProduct) {
      throw new NotFoundException("상품을 찾을 수 없습니다.");
    }

    // 상품 코드 중복 확인 (자기 자신 제외)
    if (data.code && data.code !== existingProduct.code) {
      const duplicateCode = await this.prisma.shopProduct.findUnique({
        where: { code: data.code },
      });
      if (duplicateCode) {
        throw new BadRequestException("이미 존재하는 상품 코드입니다.");
      }
    }

    // 기존 이미지/옵션 삭제 후 새로 생성
    await this.prisma.$transaction(async (tx) => {
      // 기존 이미지 삭제 (로컬 파일도 삭제)
      if (images) {
        const oldImages = await tx.shopProductImage.findMany({
          where: { productId: id },
        });

        // 안전한 이미지 파일 삭제 (Path Traversal 방어)
        for (const img of oldImages) {
          await this.safeDeleteImageFile(img.imageUrl);
        }

        await tx.shopProductImage.deleteMany({ where: { productId: id } });
      }

      // 기존 옵션 삭제
      if (options) {
        await tx.shopProductOption.deleteMany({ where: { productId: id } });
      }

      // 상품 업데이트
      await tx.shopProduct.update({
        where: { id },
        data: {
          ...productData,
          images: images
            ? {
                create: images.map((img, index) => ({
                  imageUrl: img.imageUrl,
                  altText: img.altText,
                  isMain: img.isMain,
                  displayOrder: img.displayOrder ?? index,
                })),
              }
            : undefined,
          options: options
            ? {
                create: options.map((opt) => ({
                  optionName: opt.optionName,
                  optionValue: opt.optionValue,
                  additionalPrice: opt.additionalPrice,
                  stock: opt.stock,
                  isActive: opt.isActive,
                })),
              }
            : undefined,
        },
      });
    });

    return this.getProduct(id);
  }

  async deleteProduct(id: string) {
    const product = await this.prisma.shopProduct.findUnique({
      where: { id },
      include: { images: true },
    });

    if (!product) {
      throw new NotFoundException("상품을 찾을 수 없습니다.");
    }

    // 안전한 이미지 파일 삭제 (Path Traversal 방어)
    for (const img of product.images) {
      await this.safeDeleteImageFile(img.imageUrl);
    }

    await this.prisma.shopProduct.delete({ where: { id } });
    this.logger.log(
      `상품 삭제 완료: ${id} (이미지 ${product.images.length}개)`,
    );

    return { success: true, message: "상품이 삭제되었습니다." };
  }

  // ==================== 이미지 업로드 ====================

  async uploadImage(file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException("파일이 없습니다.");
    }

    const imageUrl = `/uploads/products/${file.filename}`;

    return {
      success: true,
      imageUrl,
      filename: file.filename,
      originalName: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
    };
  }

  async addImageToProduct(productId: string, imageData: ProductImageDto) {
    const product = await this.prisma.shopProduct.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException("상품을 찾을 수 없습니다.");
    }

    // 대표 이미지로 설정 시 기존 대표 이미지 해제
    if (imageData.isMain) {
      await this.prisma.shopProductImage.updateMany({
        where: { productId, isMain: true },
        data: { isMain: false },
      });
    }

    const image = await this.prisma.shopProductImage.create({
      data: {
        productId,
        imageUrl: imageData.imageUrl,
        altText: imageData.altText,
        isMain: imageData.isMain,
        displayOrder: imageData.displayOrder,
      },
    });

    return image;
  }

  async deleteImage(imageId: string) {
    const image = await this.prisma.shopProductImage.findUnique({
      where: { id: imageId },
    });

    if (!image) {
      throw new NotFoundException("이미지를 찾을 수 없습니다.");
    }

    // 안전한 이미지 파일 삭제 (Path Traversal 방어)
    await this.safeDeleteImageFile(image.imageUrl);

    await this.prisma.shopProductImage.delete({ where: { id: imageId } });
    this.logger.log(`이미지 삭제 완료: ${imageId}`);

    return { success: true, message: "이미지가 삭제되었습니다." };
  }

  // ==================== 카테고리 CRUD ====================

  async createCategory(data: CreateCategoryDto) {
    // 상위 카테고리 확인
    let level = 1;
    let path = data.name;

    if (data.parentId) {
      const parent = await this.prisma.shopCategory.findUnique({
        where: { id: data.parentId },
      });
      if (!parent) {
        throw new NotFoundException("상위 카테고리를 찾을 수 없습니다.");
      }
      level = parent.level + 1;
      path = `${parent.path} > ${data.name}`;
    }

    // 고유 코드 생성
    const code =
      `CAT-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`.toUpperCase();

    // 2026-05-20 Phase C-D — `sortOrder` alias 제거 완료. `displayOrder` canonical only.
    const category = await this.prisma.shopCategory.create({
      data: {
        name: data.name,
        code,
        path,
        description: data.description,
        parentId: data.parentId,
        displayOrder: data.displayOrder ?? 0,
        level,
        isActive: data.isActive !== false,
      },
    });

    return category;
  }

  async updateCategory(categoryId: string, data: UpdateCategoryDto) {
    const category = await this.prisma.shopCategory.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      throw new NotFoundException("카테고리를 찾을 수 없습니다.");
    }

    if (data.parentId) {
      const parent = await this.prisma.shopCategory.findUnique({
        where: { id: data.parentId },
      });
      if (!parent) {
        throw new NotFoundException("상위 카테고리를 찾을 수 없습니다.");
      }
    }

    // 2026-05-20 Phase C-D — `sortOrder` alias 제거 완료. `displayOrder` canonical only.
    //   data.displayOrder 가 undefined 면 Prisma 가 컬럼 변경 없이 보존.
    const updated = await this.prisma.shopCategory.update({
      where: { id: categoryId },
      data: {
        name: data.name,
        description: data.description,
        parentId: data.parentId,
        displayOrder: data.displayOrder,
        isActive: data.isActive,
      },
    });

    return updated;
  }

  async deleteCategory(categoryId: string) {
    const category = await this.prisma.shopCategory.findUnique({
      where: { id: categoryId },
      include: {
        children: true,
        products: true,
      },
    });

    if (!category) {
      throw new NotFoundException("카테고리를 찾을 수 없습니다.");
    }

    if (category.children.length > 0) {
      throw new BadRequestException(
        "하위 카테고리가 존재합니다. 먼저 하위 카테고리를 삭제해주세요.",
      );
    }

    if (category.products.length > 0) {
      throw new BadRequestException(
        "해당 카테고리에 상품이 존재합니다. 먼저 상품을 다른 카테고리로 이동하거나 삭제해주세요.",
      );
    }

    await this.prisma.shopCategory.delete({ where: { id: categoryId } });

    return { success: true, message: "카테고리가 삭제되었습니다." };
  }

  // ==================== 주문 관리 ====================

  async createOrder(userId: string, data: CreateOrderDto) {
    const orderNumber = `ORD-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

    // 트랜잭션으로 주문 생성과 재고 차감을 원자적으로 처리
    const order = await this.prisma.$transaction(
      async (tx) => {
        // 1. 모든 상품 정보 일괄 조회 (N+1 쿼리 방지)
        const productIds = data.items.map((item) => item.productId);
        const products = await tx.shopProduct.findMany({
          where: { id: { in: productIds } },
          select: {
            id: true,
            name: true,
            code: true,
            price: true,
            salePrice: true,
            stock: true,
            isActive: true,
          },
        });

        // 상품 Map 생성 (빠른 조회용)
        const productMap = new Map(products.map((p) => [p.id, p]));

        // 2. 상품 검증 및 주문 아이템 데이터 생성
        let totalAmount = 0;
        const itemsData: Array<{
          productId: string;
          productName: string;
          quantity: number;
          unitPrice: number;
          totalPrice: number;
        }> = [];

        for (const item of data.items) {
          const product = productMap.get(item.productId);

          if (!product) {
            throw new NotFoundException(
              `상품을 찾을 수 없습니다: ${item.productId}`,
            );
          }

          if (!product.isActive) {
            throw new BadRequestException(
              `판매 중지된 상품입니다: ${product.name}`,
            );
          }

          if (product.stock < item.quantity) {
            throw new BadRequestException(
              `재고가 부족합니다: ${product.name} (요청: ${item.quantity}, 재고: ${product.stock})`,
            );
          }

          // 할인가가 있으면 할인가 적용
          const unitPrice = product.salePrice ?? product.price;
          const itemTotal = Number(unitPrice) * item.quantity;
          totalAmount += itemTotal;

          itemsData.push({
            productId: item.productId,
            productName: product.name,
            quantity: item.quantity,
            unitPrice,
            totalPrice: itemTotal,
          });
        }

        // 3. 배송비 계산 (ShippingPolicy 기반 동적 계산)
        const shippingFee = await this.calculateShippingFee(
          tx,
          totalAmount,
          data.shippingAddress?.postalCode,
        );

        // 4. 재고 차감 (트랜잭션 내에서 실행)
        for (const item of data.items) {
          const result = await tx.shopProduct.updateMany({
            where: {
              id: item.productId,
              stock: { gte: item.quantity }, // 재고가 충분한 경우에만 업데이트
            },
            data: {
              stock: { decrement: item.quantity },
              salesCount: { increment: item.quantity },
            },
          });

          // 업데이트된 레코드가 없으면 재고 부족 (동시성 처리)
          if (result.count === 0) {
            const product = productMap.get(item.productId);
            throw new BadRequestException(
              `재고가 부족합니다 (동시 주문으로 인한 재고 소진): ${product?.name}`,
            );
          }
        }

        // 5. 주문 생성
        const createdOrder = await tx.shopOrder.create({
          data: {
            orderNumber,
            userId,
            totalAmount,
            shippingFee,
            paymentAmount: totalAmount + shippingFee,
            orderStatus: "pending",
            recipientName: data.shippingAddress.recipientName,
            recipientPhone: data.shippingAddress.phone,
            zipCode: data.shippingAddress.postalCode,
            address: data.shippingAddress.address,
            addressDetail: data.shippingAddress.addressDetail,
            deliveryMemo: data.shippingAddress.deliveryMemo,
            items: {
              create: itemsData,
            },
          },
          include: {
            items: true,
          },
        });

        this.logger.log(
          `주문 생성 완료: ${orderNumber} (사용자: ${userId}, 금액: ${createdOrder.paymentAmount}원)`,
        );

        return createdOrder;
      },
      {
        // 트랜잭션 옵션: 격리 수준 설정으로 동시성 문제 방지
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 10000, // 10초 타임아웃
      },
    );

    return order;
  }

  async getOrders(params: {
    status?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  }) {
    const { status, startDate, endDate, page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;

    // Prisma 타입 사용으로 타입 안전성 확보
    const where: Prisma.ShopOrderWhereInput = {};
    if (status) where.orderStatus = status;
    if (startDate || endDate) {
      where.createdAt = {
        ...(startDate && { gte: startDate }),
        ...(endDate && { lte: endDate }),
      };
    }

    const [orders, total] = await Promise.all([
      this.prisma.shopOrder.findMany({
        where,
        select: {
          id: true,
          orderNumber: true,
          userId: true,
          totalAmount: true,
          shippingFee: true,
          paymentAmount: true,
          orderStatus: true,
          createdAt: true,
          shippedAt: true,
          deliveredAt: true,
          items: {
            select: {
              id: true,
              productName: true,
              quantity: true,
              unitPrice: true,
              totalPrice: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.shopOrder.count({ where }),
    ]);

    return {
      data: orders,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getUserOrders(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      this.prisma.shopOrder.findMany({
        where: { userId },
        select: {
          id: true,
          orderNumber: true,
          totalAmount: true,
          shippingFee: true,
          paymentAmount: true,
          orderStatus: true,
          createdAt: true,
          shippedAt: true,
          deliveredAt: true,
          items: {
            select: {
              id: true,
              productId: true,
              productName: true,
              quantity: true,
              unitPrice: true,
              totalPrice: true,
              product: {
                select: {
                  id: true,
                  name: true,
                  images: {
                    where: { isMain: true },
                    take: 1,
                    select: { imageUrl: true, altText: true },
                  },
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.shopOrder.count({ where: { userId } }),
    ]);

    return {
      data: orders,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getOrder(userId: string, orderId: string) {
    const order = await this.prisma.shopOrder.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                images: { where: { isMain: true }, take: 1 },
              },
            },
          },
        },
        shipping: {
          include: {
            company: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException("주문을 찾을 수 없습니다.");
    }

    // 권한 확인 (본인 주문이거나 관리자)
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (
      order.userId !== userId &&
      user?.userType !== "ADMIN" &&
      user?.userType !== "COACH"
    ) {
      throw new ForbiddenException("주문을 조회할 권한이 없습니다.");
    }

    return order;
  }

  async updateOrderStatus(
    orderId: string,
    data: UpdateOrderStatusDto,
    updatedByUserId: string,
  ) {
    const order = await this.prisma.shopOrder.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException("주문을 찾을 수 없습니다.");
    }

    const previousStatus = order.orderStatus;

    // 배송 정보가 있으면 ShopShipping 생성/업데이트
    let shippingId = order.shippingId;
    if (data.trackingNumber && data.courierCode) {
      const company = await this.prisma.shopShippingCompany.findUnique({
        where: { code: data.courierCode },
      });

      if (company) {
        if (shippingId) {
          await this.prisma.shopShipping.update({
            where: { id: shippingId },
            data: {
              trackingNumber: data.trackingNumber,
              companyId: company.id,
              status: "shipped",
              shippedAt: new Date(),
            },
          });
        } else {
          const shipping = await this.prisma.shopShipping.create({
            data: {
              trackingNumber: data.trackingNumber,
              companyId: company.id,
              status: "shipped",
              shippedAt: new Date(),
            },
          });
          shippingId = shipping.id;
        }
      }
    }

    const updated = await this.prisma.shopOrder.update({
      where: { id: orderId },
      data: {
        orderStatus: data.status,
        shippingId,
        ...(data.status === "shipped" && { shippedAt: new Date() }),
        ...(data.status === "delivered" && { deliveredAt: new Date() }),
      },
    });

    // 감사 로그 기록
    this.logger.log(
      `주문 상태 변경: ${order.orderNumber} (${previousStatus} → ${data.status}) by 사용자 ${updatedByUserId}`,
    );

    return updated;
  }

  async cancelOrder(userId: string, orderId: string) {
    const order = await this.prisma.shopOrder.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      throw new NotFoundException("주문을 찾을 수 없습니다.");
    }

    // 권한 확인
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (order.userId !== userId && user?.userType !== "ADMIN") {
      throw new ForbiddenException("주문을 취소할 권한이 없습니다.");
    }

    // 취소 가능 상태 확인
    if (!["pending", "paid", "preparing"].includes(order.orderStatus)) {
      throw new BadRequestException(
        "이미 배송 중이거나 배송 완료된 주문은 취소할 수 없습니다.",
      );
    }

    // 주문 취소 및 재고 복구
    await this.prisma.$transaction(async (tx) => {
      await tx.shopOrder.update({
        where: { id: orderId },
        data: {
          orderStatus: "cancelled",
        },
      });

      // N+1 해소: productId 별 quantity 합산 → Promise.all 병렬 처리
      const stockIncrement = new Map<string, number>();
      for (const item of order.items) {
        stockIncrement.set(
          item.productId,
          (stockIncrement.get(item.productId) ?? 0) + item.quantity,
        );
      }
      await Promise.all(
        Array.from(stockIncrement.entries()).map(([productId, quantity]) =>
          tx.shopProduct.update({
            where: { id: productId },
            data: { stock: { increment: quantity } },
          }),
        ),
      );
    });

    // 감사 로그 기록
    this.logger.log(
      `주문 취소: ${order.orderNumber} (금액: ${order.paymentAmount}원, 상품 ${order.items.length}개) by 사용자 ${userId}`,
    );

    return { success: true, message: "주문이 취소되었습니다." };
  }

  // ==================== 배송 정책 ====================

  async getShippingPolicies() {
    return this.prisma.shippingPolicy.findMany({
      where: { isActive: true },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });
  }

  async createShippingPolicy(data: CreateShippingPolicyDto) {
    // 기본 정책으로 설정하는 경우 기존 기본 정책을 해제
    if (data.isDefault) {
      await this.prisma.shippingPolicy.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    const policy = await this.prisma.shippingPolicy.create({
      data: {
        name: data.name,
        shippingFee: data.shippingFee,
        freeShippingThreshold: data.freeShippingThreshold ?? null,
        additionalFee: data.additionalFee ?? 0,
        estimatedDays: data.estimatedDays ?? null,
        isDefault: data.isDefault ?? false,
        isActive: data.isActive !== false,
      },
    });

    this.logger.log(`배송 정책 생성: ${policy.id} (${policy.name})`);
    return policy;
  }

  async updateShippingPolicy(policyId: string, data: UpdateShippingPolicyDto) {
    const existing = await this.prisma.shippingPolicy.findUnique({
      where: { id: policyId },
    });

    if (!existing) {
      throw new NotFoundException("배송 정책을 찾을 수 없습니다.");
    }

    // 기본 정책으로 변경하는 경우 기존 기본 정책을 해제
    if (data.isDefault) {
      await this.prisma.shippingPolicy.updateMany({
        where: { isDefault: true, id: { not: policyId } },
        data: { isDefault: false },
      });
    }

    const updated = await this.prisma.shippingPolicy.update({
      where: { id: policyId },
      data: {
        name: data.name,
        shippingFee: data.shippingFee,
        freeShippingThreshold: data.freeShippingThreshold,
        additionalFee: data.additionalFee,
        estimatedDays: data.estimatedDays,
        isDefault: data.isDefault,
        isActive: data.isActive,
      },
    });

    this.logger.log(`배송 정책 수정: ${policyId} (${updated.name})`);
    return updated;
  }

  async deleteShippingPolicy(policyId: string) {
    const existing = await this.prisma.shippingPolicy.findUnique({
      where: { id: policyId },
    });

    if (!existing) {
      throw new NotFoundException("배송 정책을 찾을 수 없습니다.");
    }

    if (existing.isDefault) {
      throw new BadRequestException(
        "기본 배송 정책은 삭제할 수 없습니다. 다른 정책을 기본으로 설정 후 삭제해주세요.",
      );
    }

    await this.prisma.shippingPolicy.delete({ where: { id: policyId } });
    this.logger.log(`배송 정책 삭제: ${policyId} (${existing.name})`);

    return { success: true, message: "배송 정책이 삭제되었습니다." };
  }

  async getCouriers() {
    return [
      {
        code: "CJ",
        name: "CJ대한통운",
        trackingUrl:
          "https://www.cjlogistics.com/ko/tool/parcel/tracking?gnbInvcNo={trackingNumber}",
      },
      {
        code: "HANJIN",
        name: "한진택배",
        trackingUrl:
          "https://www.hanjin.com/kor/CMS/DeliveryMgr/WaybillResult.do?mession_key={trackingNumber}",
      },
      {
        code: "LOTTE",
        name: "롯데택배",
        trackingUrl:
          "https://www.lotteglogis.com/home/reservation/tracking/index?InvNo={trackingNumber}",
      },
      {
        code: "POST",
        name: "우체국택배",
        trackingUrl:
          "https://service.epost.go.kr/trace.RetrieveDomRi498.comm?sid1={trackingNumber}",
      },
      {
        code: "LOGEN",
        name: "로젠택배",
        trackingUrl:
          "https://www.ilogen.com/web/personal/trace/{trackingNumber}",
      },
    ];
  }

  async trackShipping(trackingNumber: string, courierCode: string) {
    const couriers = await this.getCouriers();
    const courier = couriers.find((c) => c.code === courierCode);

    if (!courier) {
      throw new NotFoundException("택배사를 찾을 수 없습니다.");
    }

    // 실제 배송 추적 API 연동은 별도 구현 필요
    // 여기서는 추적 URL만 반환
    return {
      trackingNumber,
      courierCode,
      courierName: courier.name,
      trackingUrl: courier.trackingUrl.replace(
        "{trackingNumber}",
        trackingNumber,
      ),
      message: "배송 추적은 택배사 사이트에서 확인해주세요.",
    };
  }

  // ==================== 통계 ====================

  async getShopStats(startDate?: Date, endDate?: Date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monthStart =
      startDate || new Date(today.getFullYear(), today.getMonth(), 1);
    const monthEnd =
      endDate || new Date(today.getFullYear(), today.getMonth() + 1, 0);

    const completedStatuses = ["paid", "preparing", "shipped", "delivered"];

    // 모든 통계 쿼리를 병렬로 실행 (DB 레벨 집계)
    const [
      orderStats,
      totalRevenueAgg,
      monthRevenueAgg,
      totalProducts,
      activeProducts,
      outOfStock,
    ] = await Promise.all([
      this.prisma.shopOrder.groupBy({
        by: ["orderStatus"],
        _count: true,
      }),
      this.prisma.shopOrder.aggregate({
        _sum: { paymentAmount: true },
        _count: { id: true },
        where: { orderStatus: { in: completedStatuses } },
      }),
      this.prisma.shopOrder.aggregate({
        _sum: { paymentAmount: true },
        where: {
          orderStatus: { in: completedStatuses },
          createdAt: { gte: monthStart, lte: monthEnd },
        },
      }),
      this.prisma.shopProduct.count(),
      this.prisma.shopProduct.count({ where: { isActive: true } }),
      this.prisma.shopProduct.count({ where: { stock: { lte: 0 } } }),
    ]);

    const orderCounts: Record<string, number> = {};
    orderStats.forEach((s) => {
      orderCounts[s.orderStatus] = s._count;
    });

    const totalRevenue = Number(totalRevenueAgg._sum.paymentAmount ?? 0);
    const completedOrderCount = totalRevenueAgg._count.id;
    const monthRevenue = Number(monthRevenueAgg._sum.paymentAmount ?? 0);
    const avgOrderValue =
      completedOrderCount > 0 ? totalRevenue / completedOrderCount : 0;

    return {
      orders: {
        total: Object.values(orderCounts).reduce((a, b) => a + b, 0),
        pending: orderCounts["pending"] || 0,
        paid: orderCounts["paid"] || 0,
        preparing: orderCounts["preparing"] || 0,
        shipped: orderCounts["shipped"] || 0,
        delivered: orderCounts["delivered"] || 0,
        cancelled: orderCounts["cancelled"] || 0,
      },
      revenue: {
        totalRevenue,
        monthRevenue,
        avgOrderValue: Math.round(avgOrderValue),
      },
      products: {
        totalProducts,
        activeProducts,
        outOfStock,
      },
    };
  }

  // ==================== 장바구니 ====================

  /**
   * 장바구니 조회 (상품 정보 포함)
   */
  async getCart(userId: string) {
    const cart = await this.prisma.shopCart.findUnique({
      where: { userId },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                code: true,
                price: true,
                salePrice: true,
                stock: true,
                isActive: true,
                images: {
                  where: { isMain: true },
                  take: 1,
                  select: { id: true, imageUrl: true, altText: true },
                },
              },
            },
            option: {
              select: {
                id: true,
                optionName: true,
                optionValue: true,
                additionalPrice: true,
                stock: true,
                isActive: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!cart) {
      return { items: [], totalAmount: 0, totalItems: 0 };
    }

    // 상품 정보를 포함한 응답 구성
    const items = cart.items.map((item) => {
      const unitPrice = item.product.salePrice ?? item.product.price;
      const optionPrice = item.option?.additionalPrice ?? 0;
      const itemPrice = unitPrice + optionPrice;
      const isAvailable =
        item.product.isActive &&
        (item.option
          ? item.option.isActive && item.option.stock >= item.quantity
          : item.product.stock >= item.quantity);

      return {
        id: item.id,
        productId: item.productId,
        optionId: item.optionId,
        quantity: item.quantity,
        unitPrice: itemPrice,
        totalPrice: itemPrice * item.quantity,
        isAvailable,
        product: item.product,
        option: item.option,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      };
    });

    const totalAmount = items
      .filter((i) => i.isAvailable)
      .reduce((sum, i) => sum + i.totalPrice, 0);
    const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);

    return { items, totalAmount, totalItems };
  }

  /**
   * 장바구니에 상품 추가 (이미 있으면 수량 증가)
   */
  async addToCart(userId: string, dto: AddToCartDto) {
    const { productId, optionId, quantity } = dto;

    // 상품 존재 및 활성 확인
    const product = await this.prisma.shopProduct.findUnique({
      where: { id: productId },
    });
    if (!product) {
      throw new NotFoundException("상품을 찾을 수 없습니다.");
    }
    if (!product.isActive) {
      throw new BadRequestException("판매 중이 아닌 상품입니다.");
    }

    // 옵션 확인
    if (optionId) {
      const option = await this.prisma.shopProductOption.findUnique({
        where: { id: optionId },
      });
      if (!option || option.productId !== productId) {
        throw new NotFoundException("상품 옵션을 찾을 수 없습니다.");
      }
      if (!option.isActive) {
        throw new BadRequestException(
          "선택하신 옵션은 현재 판매 중이 아닙니다.",
        );
      }
      if (option.stock < quantity) {
        throw new BadRequestException(
          `재고가 부족합니다. (현재 재고: ${option.stock}개)`,
        );
      }
    } else {
      if (product.stock < quantity) {
        throw new BadRequestException(
          `재고가 부족합니다. (현재 재고: ${product.stock}개)`,
        );
      }
    }

    // 최대 주문 수량 검사
    if (product.maxOrderQty && quantity > product.maxOrderQty) {
      throw new BadRequestException(
        `최대 주문 수량은 ${product.maxOrderQty}개입니다.`,
      );
    }

    // 장바구니 생성 (없으면) + 아이템 upsert
    const cart = await this.prisma.shopCart.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });

    // 기존 아이템 확인
    const existingItem = await this.prisma.shopCartItem.findFirst({
      where: {
        cartId: cart.id,
        productId,
        optionId: optionId ?? null,
      },
    });

    if (existingItem) {
      const newQuantity = existingItem.quantity + quantity;

      // 재고 재확인
      const availableStock = optionId
        ? ((
            await this.prisma.shopProductOption.findUnique({
              where: { id: optionId },
            })
          )?.stock ?? 0)
        : product.stock;

      if (newQuantity > availableStock) {
        throw new BadRequestException(
          `재고가 부족합니다. (현재 재고: ${availableStock}개, 장바구니: ${existingItem.quantity}개)`,
        );
      }

      if (product.maxOrderQty && newQuantity > product.maxOrderQty) {
        throw new BadRequestException(
          `최대 주문 수량은 ${product.maxOrderQty}개입니다. (현재 장바구니: ${existingItem.quantity}개)`,
        );
      }

      await this.prisma.shopCartItem.update({
        where: { id: existingItem.id },
        data: { quantity: newQuantity },
      });
    } else {
      await this.prisma.shopCartItem.create({
        data: {
          cartId: cart.id,
          productId,
          optionId: optionId ?? null,
          quantity,
        },
      });
    }

    return this.getCart(userId);
  }

  /**
   * 장바구니 아이템 수량 변경
   */
  async updateCartItem(userId: string, itemId: string, dto: UpdateCartItemDto) {
    const cart = await this.prisma.shopCart.findUnique({
      where: { userId },
    });
    if (!cart) {
      throw new NotFoundException("장바구니를 찾을 수 없습니다.");
    }

    const item = await this.prisma.shopCartItem.findUnique({
      where: { id: itemId },
      include: { product: true, option: true },
    });
    if (!item || item.cartId !== cart.id) {
      throw new NotFoundException("장바구니 상품을 찾을 수 없습니다.");
    }

    // 재고 확인
    const availableStock = item.option ? item.option.stock : item.product.stock;
    if (dto.quantity > availableStock) {
      throw new BadRequestException(
        `재고가 부족합니다. (현재 재고: ${availableStock}개)`,
      );
    }

    // 최대 주문 수량 검사
    if (item.product.maxOrderQty && dto.quantity > item.product.maxOrderQty) {
      throw new BadRequestException(
        `최대 주문 수량은 ${item.product.maxOrderQty}개입니다.`,
      );
    }

    await this.prisma.shopCartItem.update({
      where: { id: itemId },
      data: { quantity: dto.quantity },
    });

    return this.getCart(userId);
  }

  /**
   * 장바구니 아이템 삭제
   */
  async removeCartItem(userId: string, itemId: string) {
    const cart = await this.prisma.shopCart.findUnique({
      where: { userId },
    });
    if (!cart) {
      throw new NotFoundException("장바구니를 찾을 수 없습니다.");
    }

    const item = await this.prisma.shopCartItem.findUnique({
      where: { id: itemId },
    });
    if (!item || item.cartId !== cart.id) {
      throw new NotFoundException("장바구니 상품을 찾을 수 없습니다.");
    }

    await this.prisma.shopCartItem.delete({
      where: { id: itemId },
    });

    return this.getCart(userId);
  }

  /**
   * 장바구니 전체 비우기
   */
  async clearCart(userId: string) {
    const cart = await this.prisma.shopCart.findUnique({
      where: { userId },
    });

    if (cart) {
      await this.prisma.shopCartItem.deleteMany({
        where: { cartId: cart.id },
      });
    }

    return { items: [], totalAmount: 0, totalItems: 0 };
  }

  /**
   * 로컬 장바구니와 서버 장바구니 병합 (로그인 시)
   * - 서버에 이미 있는 상품: 로컬 수량으로 덮어쓰기 (더 큰 값)
   * - 서버에 없는 상품: 새로 추가
   */
  async mergeCart(userId: string, localItems: MergeCartItemDto[]) {
    if (!localItems || localItems.length === 0) {
      return this.getCart(userId);
    }

    // 장바구니 생성 (없으면)
    const cart = await this.prisma.shopCart.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });

    // N+1 해소: product/option/existingItem 을 일괄 사전 조회 후 Map lookup
    const productIds = Array.from(new Set(localItems.map((i) => i.productId)));
    const optionIds = Array.from(
      new Set(
        localItems.map((i) => i.optionId).filter((id): id is string => !!id),
      ),
    );
    const [products, options, existingItems] = await Promise.all([
      productIds.length > 0
        ? this.prisma.shopProduct.findMany({
            where: { id: { in: productIds } },
            select: {
              id: true,
              isActive: true,
              stock: true,
              maxOrderQty: true,
            },
          })
        : Promise.resolve(
            [] as Array<{
              id: string;
              isActive: boolean;
              stock: number;
              maxOrderQty: number | null;
            }>,
          ),
      optionIds.length > 0
        ? this.prisma.shopProductOption.findMany({
            where: { id: { in: optionIds } },
            select: { id: true, productId: true, isActive: true, stock: true },
          })
        : Promise.resolve(
            [] as Array<{
              id: string;
              productId: string;
              isActive: boolean;
              stock: number;
            }>,
          ),
      this.prisma.shopCartItem.findMany({
        where: {
          cartId: cart.id,
          productId: { in: productIds },
        },
        select: { id: true, productId: true, optionId: true, quantity: true },
      }),
    ]);
    const productMap = new Map(products.map((p) => [p.id, p]));
    const optionMap = new Map(options.map((o) => [o.id, o]));
    const existingKey = (productId: string, optionId: string | null) =>
      `${productId}::${optionId ?? ""}`;
    const existingMap = new Map(
      existingItems.map((e) => [existingKey(e.productId, e.optionId), e]),
    );

    for (const localItem of localItems) {
      const { productId, optionId, quantity } = localItem;

      const product = productMap.get(productId);
      if (!product || !product.isActive) {
        continue; // 유효하지 않은 상품은 건너뜀
      }

      if (optionId) {
        const option = optionMap.get(optionId);
        if (!option || option.productId !== productId || !option.isActive) {
          continue;
        }
      }

      const availableStock = optionId
        ? (optionMap.get(optionId)?.stock ?? 0)
        : product.stock;

      const safeQuantity = Math.min(
        quantity,
        availableStock,
        product.maxOrderQty ?? 99,
      );
      if (safeQuantity <= 0) continue;

      const existingItem = existingMap.get(
        existingKey(productId, optionId ?? null),
      );

      if (existingItem) {
        const mergedQuantity = Math.max(existingItem.quantity, safeQuantity);
        await this.prisma.shopCartItem.update({
          where: { id: existingItem.id },
          data: { quantity: mergedQuantity },
        });
      } else {
        await this.prisma.shopCartItem.create({
          data: {
            cartId: cart.id,
            productId,
            optionId: optionId ?? null,
            quantity: safeQuantity,
          },
        });
      }
    }

    return this.getCart(userId);
  }

  // ================ Private Helpers ================

  /**
   * 배송비 동적 계산
   * 1. 기본(default) 배송 정책 조회
   * 2. 무료배송 기준금액 이상이면 0원
   * 3. 제주/도서산간 우편번호면 추가 배송비 적용
   * 4. 정책이 없으면 기본값 3,000원 / 5만원 이상 무료
   */
  private async calculateShippingFee(
    tx: { shippingPolicy: PrismaService["shippingPolicy"] },
    totalAmount: number,
    postalCode?: string,
  ): Promise<number> {
    // 기본 배송 정책 조회
    const policy = await tx.shippingPolicy.findFirst({
      where: { isDefault: true, isActive: true },
      select: {
        shippingFee: true,
        freeShippingThreshold: true,
        additionalFee: true,
      },
    });

    // 정책이 없으면 기본값 사용
    const baseFee = policy?.shippingFee ?? 3000;
    const freeThreshold = policy?.freeShippingThreshold ?? 50000;
    const additionalFee = policy?.additionalFee ?? 0;

    // 무료배송 기준금액 이상이면 0원
    if (freeThreshold > 0 && totalAmount >= freeThreshold) {
      return 0;
    }

    // 제주/도서산간 추가 배송비
    let extraFee = 0;
    if (postalCode && this.isRemoteArea(postalCode)) {
      extraFee = additionalFee;
    }

    return baseFee + extraFee;
  }

  /**
   * 제주/도서산간 지역 판별 (우편번호 기반)
   * 제주: 63000~63644
   * 도서산간: 별도 목록 (주요 섬 지역)
   */
  private isRemoteArea(postalCode: string): boolean {
    const code = parseInt(postalCode, 10);
    if (isNaN(code)) return false;

    // 제주도 (63000 ~ 63644)
    if (code >= 63000 && code <= 63644) return true;

    // 주요 도서산간 우편번호 범위
    const remoteRanges = [
      [22386, 22388], // 인천 옹진군 (백령도 등)
      [23004, 23010], // 인천 옹진군 (연평도 등)
      [52570, 52571], // 경남 통영시 (한산도 등)
      [53031, 53033], // 경남 거제시 일부
      [56347, 56349], // 전남 신안군
      [57068, 57069], // 전남 여수시 (거문도 등)
      [58760, 58762], // 전남 완도군
      [59102, 59103], // 전남 해남군 일부
      [59127, 59127], // 전남 진도군
    ];

    for (const [start, end] of remoteRanges) {
      if (code >= start && code <= end) return true;
    }

    return false;
  }
}
