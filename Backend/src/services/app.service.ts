import { CategoryService } from "./category.service";
import { ProductService } from "./product.service";

const productService = new ProductService();
const categoryService = new CategoryService();


class AppService {
    private productService: ProductService;
    private categoryService: CategoryService;

    constructor() {
        this.productService = productService;
        this.categoryService = categoryService;
    }
    
    public async getHomeData() {
        const [featuredProducts, bestSellingProducts, categories] = await Promise.all([
            this.productService.getFeaturedProducts(),
            this.productService.getBestSellingProducts(),
            this.categoryService.getCategories(),
        ]);

        return {
            featuredProducts,
            bestSellingProducts,
            categories,
        };
    };

    public async searchProducts(query: string) {
        const products = await this.productService.getProductByNameSearch(query);
        return products;
    }
}

export default AppService;