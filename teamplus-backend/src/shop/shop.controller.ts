import {
  Controller,
  Post,
  Get,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiOperation,
  ApiTags,
  ApiResponse,
  ApiOkResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
  ApiQuery,
} from "@nestjs/swagger";
import { ShopCategoryResponseDto } from "./dto/responses/shop-category-response.dto";
import { ShopService } from "./shop.service";
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
import { AddToCartDto, UpdateCartItemDto, MergeCartDto } from "./dto/cart.dto";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";
import { Public } from "@/auth/public.decorator";
import { AuditAction } from "@/common/decorators";
import { AuthenticatedRequest } from "@/common/interfaces/authenticated-request.interface";

@ApiTags("Shop - 쇼핑몰")
@Controller("api/v1/shop")
export class ShopController {
  constructor(private readonly shopService: ShopService) {}

  // ==================== 카테고리 ====================

  @Get("categories")
  @Public()
  @ApiOperation({
    summary: "카테고리 목록 조회",
    description: "활성화된 모든 카테고리를 조회합니다.",
  })
  @ApiResponse({ status: 200, description: "카테고리 목록 조회 성공" })
  async getCategories() {
    return this.shopService.getCategories();
  }

  @Get("categories/tree")
  @Public()
  @ApiOperation({
    summary: "카테고리 트리 조회",
    description:
      "계층 구조로 카테고리를 조회합니다. 최대 4depth (대분류→중분류→소분류→세분류).",
  })
  @ApiOkResponse({
    description: "카테고리 트리 (최대 4depth · isActive=true 만 포함)",
    type: [ShopCategoryResponseDto],
  })
  async getCategoryTree(): Promise<ShopCategoryResponseDto[]> {
    return this.shopService.getCategoryTree();
  }

  // ==================== 상품 ====================

  @Post("products")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN", "COACH")
  @AuditAction({
    action: "shop.product.create",
    resource: "ShopProduct",
    includeKeys: ["name", "categoryId", "price"],
  })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "상품 등록",
    description: "새로운 상품을 등록합니다. (관리자/코치만)",
  })
  @ApiResponse({ status: 201, description: "상품 등록 성공" })
  @ApiResponse({ status: 400, description: "잘못된 요청" })
  @ApiResponse({ status: 404, description: "카테고리를 찾을 수 없음" })
  async createProduct(@Body() createProductDto: CreateProductDto) {
    return this.shopService.createProduct(createProductDto);
  }

  @Get("products")
  @Public()
  @ApiOperation({
    summary: "상품 목록 조회",
    description: "상품 목록을 조회합니다. 필터링 및 페이지네이션을 지원합니다.",
  })
  @ApiQuery({ name: "categoryId", required: false, description: "카테고리 ID" })
  @ApiQuery({
    name: "isActive",
    required: false,
    type: Boolean,
    description: "활성화 여부",
  })
  @ApiQuery({
    name: "isFeatured",
    required: false,
    type: Boolean,
    description: "추천 상품 여부",
  })
  @ApiQuery({
    name: "search",
    required: false,
    description: "검색어 (상품명, 코드, 브랜드)",
  })
  @ApiQuery({
    name: "page",
    required: false,
    type: Number,
    description: "페이지 번호 (기본: 1)",
  })
  @ApiQuery({
    name: "limit",
    required: false,
    type: Number,
    description: "페이지당 항목 수 (기본: 20)",
  })
  @ApiResponse({ status: 200, description: "상품 목록 조회 성공" })
  async getProducts(
    @Query("categoryId") categoryId?: string,
    @Query("isActive") isActive?: string,
    @Query("isFeatured") isFeatured?: string,
    @Query("search") search?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.shopService.getProducts({
      categoryId,
      isActive: isActive ? isActive === "true" : undefined,
      isFeatured: isFeatured ? isFeatured === "true" : undefined,
      search,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @Get("products/:id")
  @Public()
  @ApiOperation({
    summary: "상품 상세 조회",
    description: "상품의 상세 정보를 조회합니다.",
  })
  @ApiResponse({ status: 200, description: "상품 상세 조회 성공" })
  @ApiResponse({ status: 404, description: "상품을 찾을 수 없음" })
  async getProduct(
    @Param("id") id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    const userId: string | undefined = req?.user?.id;
    return this.shopService.getProduct(id, userId);
  }

  @Put("products/:id")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN", "COACH")
  @AuditAction({
    action: "shop.product.update",
    resource: "ShopProduct",
    includeKeys: ["id"],
  })
  @ApiBearerAuth()
  @ApiOperation({
    summary: "상품 수정",
    description: "상품 정보를 수정합니다. (관리자/코치만)",
  })
  @ApiResponse({ status: 200, description: "상품 수정 성공" })
  @ApiResponse({ status: 404, description: "상품을 찾을 수 없음" })
  async updateProduct(
    @Param("id") id: string,
    @Body() updateProductDto: UpdateProductDto,
  ) {
    return this.shopService.updateProduct(id, updateProductDto);
  }

  @Delete("products/:id")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN", "COACH")
  @AuditAction({
    action: "shop.product.delete",
    resource: "ShopProduct",
    includeKeys: ["id"],
  })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "상품 삭제",
    description: "상품을 삭제합니다. (관리자/코치만)",
  })
  @ApiResponse({ status: 200, description: "상품 삭제 성공" })
  @ApiResponse({ status: 404, description: "상품을 찾을 수 없음" })
  async deleteProduct(@Param("id") id: string) {
    return this.shopService.deleteProduct(id);
  }

  // ==================== 이미지 업로드 ====================

  @Post("upload/image")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN", "COACH")
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor("file"))
  @ApiConsumes("multipart/form-data")
  @ApiOperation({
    summary: "이미지 업로드",
    description: "상품 이미지를 서버에 업로드합니다. (관리자/코치만)",
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        file: {
          type: "string",
          format: "binary",
          description: "이미지 파일 (jpg, png, gif, webp, 최대 10MB)",
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: "이미지 업로드 성공",
    schema: {
      example: {
        success: true,
        imageUrl: "/uploads/products/1704567890-abc123.jpg",
        filename: "1704567890-abc123.jpg",
        originalName: "product.jpg",
        size: 1024000,
        mimetype: "image/jpeg",
      },
    },
  })
  @ApiResponse({ status: 400, description: "잘못된 파일 형식 또는 크기 초과" })
  async uploadImage(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }), // 10MB
          new FileTypeValidator({
            fileType: /^image\/(jpeg|jpg|png|gif|webp)$/,
          }),
        ],
        fileIsRequired: true,
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.shopService.uploadImage(file);
  }

  @Post("products/:productId/images")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN", "COACH")
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "상품에 이미지 추가",
    description: "기존 상품에 이미지를 추가합니다. (관리자/코치만)",
  })
  @ApiResponse({ status: 201, description: "이미지 추가 성공" })
  @ApiResponse({ status: 404, description: "상품을 찾을 수 없음" })
  async addImageToProduct(
    @Param("productId") productId: string,
    @Body() imageData: ProductImageDto,
  ) {
    return this.shopService.addImageToProduct(productId, imageData);
  }

  @Delete("images/:imageId")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN", "COACH")
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "이미지 삭제",
    description: "상품 이미지를 삭제합니다. (관리자/코치만)",
  })
  @ApiResponse({ status: 200, description: "이미지 삭제 성공" })
  @ApiResponse({ status: 404, description: "이미지를 찾을 수 없음" })
  async deleteImage(@Param("imageId") imageId: string) {
    return this.shopService.deleteImage(imageId);
  }

  // ==================== 카테고리 관리 (CRUD) ====================

  @Post("categories")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN")
  @AuditAction({
    action: "shop.category.create",
    resource: "ShopCategory",
    includeKeys: ["name", "parentId"],
  })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "카테고리 생성",
    description: "새로운 카테고리를 생성합니다. (관리자 전용)",
  })
  @ApiResponse({ status: 201, description: "카테고리 생성 성공" })
  async createCategory(@Body() createCategoryDto: CreateCategoryDto) {
    return this.shopService.createCategory(createCategoryDto);
  }

  @Put("categories/:categoryId")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "카테고리 수정",
    description: "카테고리 정보를 수정합니다. (관리자 전용)",
  })
  @ApiResponse({ status: 200, description: "카테고리 수정 성공" })
  @ApiResponse({ status: 404, description: "카테고리를 찾을 수 없음" })
  async updateCategory(
    @Param("categoryId") categoryId: string,
    @Body() updateCategoryDto: UpdateCategoryDto,
  ) {
    return this.shopService.updateCategory(categoryId, updateCategoryDto);
  }

  @Delete("categories/:categoryId")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN")
  @AuditAction({
    action: "shop.category.delete",
    resource: "ShopCategory",
    includeKeys: ["categoryId"],
  })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "카테고리 삭제",
    description:
      "카테고리를 삭제합니다. 하위 카테고리나 상품이 있으면 삭제할 수 없습니다. (관리자 전용)",
  })
  @ApiResponse({ status: 200, description: "카테고리 삭제 성공" })
  @ApiResponse({ status: 400, description: "하위 카테고리나 상품이 존재함" })
  @ApiResponse({ status: 404, description: "카테고리를 찾을 수 없음" })
  async deleteCategory(@Param("categoryId") categoryId: string) {
    return this.shopService.deleteCategory(categoryId);
  }

  // ==================== 주문 관리 ====================

  @Post("orders")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("PARENT", "COACH", "ADMIN")
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "주문 생성",
    description: "새로운 주문을 생성합니다.",
  })
  @ApiResponse({
    status: 201,
    description: "주문 생성 성공",
    schema: {
      example: {
        id: "order-uuid",
        orderNumber: "ORD-1704567890-abc123",
        status: "pending",
        totalAmount: 150000,
        shippingFee: 3000,
        items: [],
        createdAt: "2026-01-11T10:00:00Z",
      },
    },
  })
  async createOrder(
    @Request() req: AuthenticatedRequest,
    @Body() createOrderDto: CreateOrderDto,
  ) {
    return this.shopService.createOrder(req.user.id, createOrderDto);
  }

  @Get("orders")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN", "COACH")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "주문 목록 조회 (관리자)",
    description: "전체 주문 목록을 조회합니다. (관리자/코치 전용)",
  })
  @ApiQuery({ name: "status", required: false, description: "주문 상태" })
  @ApiQuery({ name: "startDate", required: false, description: "시작일" })
  @ApiQuery({ name: "endDate", required: false, description: "종료일" })
  @ApiQuery({ name: "page", required: false, description: "페이지 번호" })
  @ApiQuery({ name: "limit", required: false, description: "페이지당 개수" })
  @ApiResponse({ status: 200, description: "주문 목록 조회 성공" })
  async getOrders(
    @Query("status") status?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.shopService.getOrders({
      status,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @Get("orders/my")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("PARENT", "COACH", "ADMIN")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "내 주문 목록 조회",
    description: "현재 로그인한 사용자의 주문 목록을 조회합니다.",
  })
  @ApiQuery({ name: "page", required: false, description: "페이지 번호" })
  @ApiQuery({ name: "limit", required: false, description: "페이지당 개수" })
  @ApiResponse({ status: 200, description: "주문 목록 조회 성공" })
  async getMyOrders(
    @Request() req: AuthenticatedRequest,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.shopService.getUserOrders(
      req.user.id,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get("orders/:orderId")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("PARENT", "COACH", "ADMIN")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "주문 상세 조회",
    description: "주문 상세 정보를 조회합니다.",
  })
  @ApiResponse({ status: 200, description: "주문 조회 성공" })
  @ApiResponse({ status: 404, description: "주문을 찾을 수 없음" })
  async getOrder(
    @Request() req: AuthenticatedRequest,
    @Param("orderId") orderId: string,
  ) {
    return this.shopService.getOrder(req.user.id, orderId);
  }

  @Patch("orders/:orderId/status")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN", "COACH")
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "주문 상태 변경",
    description: "주문 상태를 변경합니다. (관리자/코치 전용)",
  })
  @ApiResponse({ status: 200, description: "상태 변경 성공" })
  @ApiResponse({ status: 404, description: "주문을 찾을 수 없음" })
  async updateOrderStatus(
    @Request() req: AuthenticatedRequest,
    @Param("orderId") orderId: string,
    @Body() updateStatusDto: UpdateOrderStatusDto,
  ) {
    return this.shopService.updateOrderStatus(
      orderId,
      updateStatusDto,
      req.user.id,
    );
  }

  @Post("orders/:orderId/cancel")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("PARENT", "ADMIN")
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "주문 취소",
    description: "주문을 취소합니다. (결제 전 또는 배송 전)",
  })
  @ApiResponse({ status: 200, description: "주문 취소 성공" })
  @ApiResponse({ status: 400, description: "취소할 수 없는 주문 상태" })
  @ApiResponse({ status: 404, description: "주문을 찾을 수 없음" })
  async cancelOrder(
    @Request() req: AuthenticatedRequest,
    @Param("orderId") orderId: string,
  ) {
    return this.shopService.cancelOrder(req.user.id, orderId);
  }

  // ==================== 배송 정책 관리 ====================

  @Get("shipping/policies")
  @Public()
  @ApiOperation({
    summary: "배송 정책 목록 조회",
    description: "활성화된 배송 정책 목록을 조회합니다.",
  })
  @ApiResponse({ status: 200, description: "배송 정책 목록 조회 성공" })
  async getShippingPolicies() {
    return this.shopService.getShippingPolicies();
  }

  @Post("shipping/policies")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN")
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "배송 정책 생성",
    description: "새로운 배송 정책을 생성합니다. (관리자 전용)",
  })
  @ApiResponse({ status: 201, description: "배송 정책 생성 성공" })
  async createShippingPolicy(@Body() createPolicyDto: CreateShippingPolicyDto) {
    return this.shopService.createShippingPolicy(createPolicyDto);
  }

  @Put("shipping/policies/:policyId")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "배송 정책 수정",
    description: "배송 정책을 수정합니다. (관리자 전용)",
  })
  @ApiResponse({ status: 200, description: "배송 정책 수정 성공" })
  @ApiResponse({ status: 404, description: "배송 정책을 찾을 수 없음" })
  async updateShippingPolicy(
    @Param("policyId") policyId: string,
    @Body() updatePolicyDto: UpdateShippingPolicyDto,
  ) {
    return this.shopService.updateShippingPolicy(policyId, updatePolicyDto);
  }

  @Delete("shipping/policies/:policyId")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN")
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "배송 정책 삭제",
    description: "배송 정책을 삭제합니다. (관리자 전용)",
  })
  @ApiResponse({ status: 200, description: "배송 정책 삭제 성공" })
  @ApiResponse({ status: 404, description: "배송 정책을 찾을 수 없음" })
  async deleteShippingPolicy(@Param("policyId") policyId: string) {
    return this.shopService.deleteShippingPolicy(policyId);
  }

  @Get("shipping/couriers")
  @Public()
  @ApiOperation({
    summary: "택배사 목록 조회",
    description: "지원되는 택배사 목록을 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "택배사 목록 조회 성공",
    schema: {
      example: [
        { code: "CJ", name: "CJ대한통운" },
        { code: "HANJIN", name: "한진택배" },
        { code: "LOTTE", name: "롯데택배" },
      ],
    },
  })
  async getCouriers() {
    return this.shopService.getCouriers();
  }

  @Get("shipping/tracking/:trackingNumber")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("PARENT", "COACH", "ADMIN")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "배송 추적",
    description: "운송장 번호로 배송 상태를 추적합니다.",
  })
  @ApiQuery({ name: "courierCode", required: true, description: "택배사 코드" })
  @ApiResponse({ status: 200, description: "배송 추적 성공" })
  async trackShipping(
    @Param("trackingNumber") trackingNumber: string,
    @Query("courierCode") courierCode: string,
  ) {
    return this.shopService.trackShipping(trackingNumber, courierCode);
  }

  // ==================== 장바구니 ====================

  @Get("cart")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("PARENT", "TEEN", "COACH", "ADMIN")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "장바구니 조회",
    description: "현재 로그인한 사용자의 장바구니를 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "장바구니 조회 성공",
    schema: {
      example: {
        items: [
          {
            id: "item-cuid",
            productId: "product-cuid",
            optionId: null,
            quantity: 2,
            unitPrice: 35000,
            totalPrice: 70000,
            isAvailable: true,
            product: {
              id: "product-cuid",
              name: "하키 스틱",
              price: 35000,
              salePrice: null,
              stock: 10,
              isActive: true,
              images: [],
            },
            option: null,
          },
        ],
        totalAmount: 70000,
        totalItems: 2,
      },
    },
  })
  async getCart(@Request() req: AuthenticatedRequest) {
    return this.shopService.getCart(req.user.id);
  }

  @Post("cart/merge")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("PARENT", "TEEN", "COACH", "ADMIN")
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "로컬 장바구니 병합",
    description:
      "로그인 시 localStorage에 저장된 장바구니를 서버 장바구니와 병합합니다. 같은 상품이 있으면 더 큰 수량으로 업데이트됩니다.",
  })
  @ApiResponse({ status: 200, description: "장바구니 병합 성공" })
  async mergeCart(
    @Request() req: AuthenticatedRequest,
    @Body() mergeCartDto: MergeCartDto,
  ) {
    return this.shopService.mergeCart(req.user.id, mergeCartDto.items);
  }

  @Post("cart")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("PARENT", "TEEN", "COACH", "ADMIN")
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "장바구니에 상품 추가",
    description:
      "장바구니에 상품을 추가합니다. 이미 같은 상품/옵션이 있으면 수량이 증가합니다.",
  })
  @ApiResponse({ status: 200, description: "장바구니 추가 성공" })
  @ApiResponse({ status: 400, description: "재고 부족 또는 판매 중지 상품" })
  @ApiResponse({ status: 404, description: "상품을 찾을 수 없음" })
  async addToCart(
    @Request() req: AuthenticatedRequest,
    @Body() addToCartDto: AddToCartDto,
  ) {
    return this.shopService.addToCart(req.user.id, addToCartDto);
  }

  @Patch("cart/:itemId")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("PARENT", "TEEN", "COACH", "ADMIN")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "장바구니 상품 수량 변경",
    description: "장바구니에 담긴 상품의 수량을 변경합니다.",
  })
  @ApiResponse({ status: 200, description: "수량 변경 성공" })
  @ApiResponse({ status: 400, description: "재고 부족" })
  @ApiResponse({ status: 404, description: "장바구니 상품을 찾을 수 없음" })
  async updateCartItem(
    @Request() req: AuthenticatedRequest,
    @Param("itemId") itemId: string,
    @Body() updateCartItemDto: UpdateCartItemDto,
  ) {
    return this.shopService.updateCartItem(
      req.user.id,
      itemId,
      updateCartItemDto,
    );
  }

  @Delete("cart")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("PARENT", "TEEN", "COACH", "ADMIN")
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "장바구니 전체 비우기",
    description: "장바구니의 모든 상품을 삭제합니다.",
  })
  @ApiResponse({ status: 200, description: "장바구니 비우기 성공" })
  async clearCart(@Request() req: AuthenticatedRequest) {
    return this.shopService.clearCart(req.user.id);
  }

  @Delete("cart/:itemId")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("PARENT", "TEEN", "COACH", "ADMIN")
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "장바구니 상품 삭제",
    description: "장바구니에서 특정 상품을 삭제합니다.",
  })
  @ApiResponse({ status: 200, description: "삭제 성공" })
  @ApiResponse({ status: 404, description: "장바구니 상품을 찾을 수 없음" })
  async removeCartItem(
    @Request() req: AuthenticatedRequest,
    @Param("itemId") itemId: string,
  ) {
    return this.shopService.removeCartItem(req.user.id, itemId);
  }

  // ==================== 통계 ====================

  @Get("stats/overview")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @Roles("ADMIN", "COACH")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "쇼핑몰 통계",
    description: "쇼핑몰 전체 통계를 조회합니다. (관리자/코치 전용)",
  })
  @ApiQuery({ name: "startDate", required: false, description: "시작일" })
  @ApiQuery({ name: "endDate", required: false, description: "종료일" })
  @ApiResponse({
    status: 200,
    description: "통계 조회 성공",
    schema: {
      example: {
        orders: {
          total: 100,
          pending: 10,
          shipped: 20,
          delivered: 65,
          cancelled: 5,
        },
        revenue: {
          totalRevenue: 15000000,
          monthRevenue: 3000000,
          avgOrderValue: 150000,
        },
        products: {
          totalProducts: 50,
          activeProducts: 45,
          outOfStock: 3,
        },
      },
    },
  })
  async getShopStats(
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    return this.shopService.getShopStats(
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }
}
