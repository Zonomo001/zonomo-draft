import { User, Product, Order } from "../payload-types";
import { BeforeChangeHook } from "payload/dist/collections/config/types";
import { Access, CollectionConfig } from "payload/types";

const addUser: BeforeChangeHook = ({ req, data }) => {
  const user = req.user as User | null;
  return { ...data, user: user?.id };
};

const yourOwnAndPurchased: Access = async ({ req }) => {
  const user = req.user as User | null;

  if (user?.role === "admin") return true;
  if (!user) return false;

  const { docs: products } = (await req.payload.find({
    collection: "products",
    depth: 0,
    where: {
      user: {
        equals: user.id,
      },
    },
  })) as unknown as { docs: Product[] };

  const ownProductFileIds = products
    .map((prod) => {
      if (!prod.product_files) return undefined;
      return typeof prod.product_files === "string"
        ? prod.product_files
        : prod.product_files.id;
    })
    .filter(Boolean);

  const { docs: orders } = (await req.payload.find({
    collection: "orders",
    depth: 2,
    where: {
      user: {
        equals: user.id,
      },
    },
  })) as unknown as { docs: Order[] };

  const purchasedProductFileIds = orders
    .map((order) => {
      return order.products.map((product: Product | string) => {
        if (typeof product === "string") {
          req.payload.logger.error(
            "Search depth not sufficient to find purchased file IDs"
          );
          return undefined;
        }

        return product.product_files
          ? typeof product.product_files === "string"
            ? product.product_files
            : product.product_files?.id
          : undefined;
      });
    })
    .filter(Boolean)
    .flat();

  return {
    id: {
      in: [...ownProductFileIds, ...purchasedProductFileIds],
    },
  };
};

export const ProductFiles: CollectionConfig = {
  slug: "product_files",
  admin: {
    hidden: ({ user }) => user.role !== "admin",
  },
  hooks: {
    beforeChange: [addUser],
  },
  access: {
    read: yourOwnAndPurchased,
    update: ({ req }) => req.user.role === "admin",
    delete: ({ req }) => req.user.role === "admin",
  },
  upload: {
    staticURL: "/product_files",
    staticDir: "product_files",
    mimeTypes: ["image/*", "font/*", "application/postscript"],
  },
  fields: [
    {
      name: "user",
      type: "relationship",
      relationTo: "users",
      admin: {
        condition: () => false,
      },
      hasMany: false,
      required: true,
    },
  ],
};
