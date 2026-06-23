import { Module } from "@nestjs/common";
import { WishlistsController } from "./wishlists.controller";
import { WishlistsService } from "./wishlists.service";
import { PrismaModule } from "@/prisma/prisma.module";

/**
 * WishlistsModule
 *
 * 통합 찜(Wishlist) 관리 모듈.
 * - polymorphic 방식으로 PRODUCT, CLUB, ACADEMY, COACH, CLASS, TOURNAMENT, VENUE 등을 통합 관리
 * - 기존 ShopWishlist과 dual-write 유지 (PRODUCT 타입, 30일 grace period)
 */
@Module({
  imports: [PrismaModule],
  controllers: [WishlistsController],
  providers: [WishlistsService],
  exports: [WishlistsService],
})
export class WishlistsModule {}
