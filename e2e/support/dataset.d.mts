// A dataset's image: a placeholder in one colour, or a file of its own.
export type DatasetImage = {
  color?: string;
  file?: string;
  width: number;
  height: number;
  alt?: string;
};

export type DatasetProduct = {
  handle: string;
  title: string;
  price: string;
  type?: string;
  compareAtPrice?: string;
  description?: string;
  details?: string[];
  sizes?: string[];
  stock?: number | Record<string, number>;
  soldOut?: boolean;
  new?: boolean;
  images?: DatasetImage[];
};

export type DatasetCollection = {
  handle: string;
  title: string;
  description?: string;
  image?: DatasetImage;
  products: string[];
};

export type DatasetMenuItem = {
  title: string;
  url?: string | null;
  items?: DatasetMenuItem[];
};

export type PolicyKey = "shipping" | "refund" | "privacy" | "terms";

export type Dataset = {
  currency?: string;
  sizes?: string[];
  products: DatasetProduct[];
  collections?: DatasetCollection[];
  menus?: Record<string, DatasetMenuItem[]>;
  recommendations?: Record<
    string,
    { related?: string[]; complementary?: string[] }
  >;
  policies?: Partial<Record<PolicyKey, string>>;
};

type Money = { amount: string; currencyCode: string };

// A product's listing card (the ProductCard fragment).
export type DatasetCard = {
  id: string;
  handle: string;
  title: string;
  availableForSale: boolean;
  publishedAt: string;
  variants: {
    nodes: {
      id: string;
      availableForSale: boolean;
      price: Money;
      compareAtPrice: Money | null;
    }[];
  };
};

export const DATASETS: string;
export const POLICIES: Record<
  PolicyKey,
  { field: string; handle: string; title: string; type: string }
>;
export function datasetPath(name: string): string;
export function imagesFolder(name: string): string;
export function readDataset(name: string): Dataset;
export function parseDataset(text: string, label?: string): Dataset;
export function variantsOf(product: DatasetProduct): {
  optionName: string;
  value: string;
  units: number;
  sku: string;
}[];
export function descriptionHtml(product: DatasetProduct): string;
export function policyHtml(text: string): string;
export function collectionHtml(collection: { description?: string }): string;
export function buildDataset(
  catalog: Dataset,
  // A recorded fixture's data, by name (a copy).
  template: (name: string) => unknown,
  options?: { imagesUrl?: string; now?: Date },
): {
  // Responses by fixture name (ProductContent.<handle> and so on).
  fixtures: Map<string, unknown>;
  // Units in stock, by variant id.
  stock: Map<string, number>;
  cards: Map<string, DatasetCard>;
  // Search & Discovery's filters for these products.
  filters(handles: string[]): unknown[];
};
