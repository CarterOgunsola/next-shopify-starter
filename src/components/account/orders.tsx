import Link from "next/link";
import { Fragment } from "react";
import {
  formatMoney,
  type OrderDetail,
  type OrderSummary,
  type Page,
} from "@/lib/commerce";
import { formatDate, statusLabel } from "./format";

// The order history, a page at a time, newest first.
export function OrdersTable({ page }: { page: Page<OrderSummary> }) {
  if (page.items.length === 0 && !page.previousCursor) {
    return <p>No orders yet.</p>;
  }
  return (
    <>
      <table>
        <caption className="sr-only">Your orders, newest first</caption>
        <thead>
          <tr>
            <th scope="col">Order</th>
            <th scope="col">Date</th>
            <th scope="col">Status</th>
            <th scope="col">Items</th>
            <th scope="col">Total</th>
          </tr>
        </thead>
        <tbody>
          {page.items.map((order) => (
            <tr key={order.id}>
              <th scope="row">
                <Link href={`/account/orders/${order.legacyId}`}>
                  {order.name}
                </Link>
              </th>
              <td>{formatDate(order.processedAt)}</td>
              <td>{statusLabel(order)}</td>
              <td>{order.itemCount}</td>
              <td>{formatMoney(order.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {(page.previousCursor || page.nextCursor) && (
        <nav aria-label="Order pages">
          <ul>
            {page.previousCursor && (
              <li>
                <Link
                  href={`/account/orders?before=${encodeURIComponent(page.previousCursor)}`}
                >
                  Newer orders
                </Link>
              </li>
            )}
            {page.nextCursor && (
              <li>
                <Link
                  href={`/account/orders?after=${encodeURIComponent(page.nextCursor)}`}
                >
                  Older orders
                </Link>
              </li>
            )}
          </ul>
        </nav>
      )}
    </>
  );
}

function Address({ title, lines }: { title: string; lines: string[] | null }) {
  if (!lines?.length) return null;
  return (
    <section aria-labelledby={`${title}-heading`.replace(/\s/g, "-")}>
      <h2 id={`${title}-heading`.replace(/\s/g, "-")}>{title}</h2>
      <address>
        {lines.map((line, index) => (
          <span key={index}>
            {line}
            <br />
          </span>
        ))}
      </address>
    </section>
  );
}

// The carrier's latest status, in our words.
const SHIPMENT_STATUS: Record<string, string> = {
  LABEL_PRINTED: "Preparing to ship",
  LABEL_PURCHASED: "Preparing to ship",
  CONFIRMED: "Preparing to ship",
  CARRIER_PICKED_UP: "Shipped",
  IN_TRANSIT: "In transit",
  OUT_FOR_DELIVERY: "Out for delivery",
  ATTEMPTED_DELIVERY: "Delivery attempted",
  DELAYED: "Delayed",
  DELIVERED: "Delivered",
  READY_FOR_PICKUP: "Ready for pickup",
  PICKED_UP: "Picked up",
  FAILURE: "Delivery failed",
};

function Shipment({
  shipment,
  number,
  of,
}: {
  shipment: OrderDetail["fulfillments"][number];
  number: number;
  of: number;
}) {
  const facts = [
    shipment.shipmentStatus
      ? (SHIPMENT_STATUS[shipment.shipmentStatus] ?? "Shipped")
      : "Shipped",
    shipment.estimatedDeliveryAt && shipment.shipmentStatus !== "DELIVERED"
      ? `expected ${formatDate(shipment.estimatedDeliveryAt)}`
      : null,
    `${shipment.itemCount} ${shipment.itemCount === 1 ? "item" : "items"}`,
  ].filter(Boolean);
  return (
    <>
      <p>
        {of > 1 ? `Shipment ${number} of ${of}: ` : "Shipment: "}
        {facts.join(" · ")}
      </p>
      {shipment.tracking.length > 0 && (
        <ul aria-label={`Tracking for shipment ${number}`}>
          {shipment.tracking.map((t, index) => (
            <li key={index}>
              {t.url ? (
                <a href={t.url}>
                  Track {t.company ?? "shipment"}
                  {t.number ? ` ${t.number}` : ""}
                </a>
              ) : (
                `${t.company ?? "Shipment"} ${t.number ?? ""}`.trim()
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function OrderDetailView({ order }: { order: OrderDetail }) {
  return (
    <article aria-labelledby="order-heading">
      <h1 id="order-heading">Order {order.name}</h1>
      <p>
        Placed {formatDate(order.processedAt)} · {statusLabel(order)}
      </p>

      <section aria-labelledby="items-heading">
        <h2 id="items-heading">Items</h2>
        <ul aria-label="Items in this order">
          {order.lines.map((line) => (
            <li key={line.id}>
              <p>
                {line.title}
                {line.variantTitle && <> ({line.variantTitle})</>}
              </p>
              <p>
                {line.quantity} × {formatMoney(line.price)} ={" "}
                {formatMoney(line.total)}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="summary-heading">
        <h2 id="summary-heading">Summary</h2>
        <dl>
          {order.subtotal && (
            <>
              <dt>Subtotal</dt>
              <dd>{formatMoney(order.subtotal)}</dd>
            </>
          )}
          {order.discounts.map((discount, index) => (
            <Fragment key={index}>
              <dt>Discount ({discount.title})</dt>
              <dd>−{formatMoney(discount.amount)}</dd>
            </Fragment>
          ))}
          {order.shipping && (
            <>
              <dt>
                Shipping
                {order.shipping.title ? ` (${order.shipping.title})` : ""}
              </dt>
              <dd>{formatMoney(order.shipping.amount)}</dd>
            </>
          )}
          {order.tax && (
            <>
              <dt>Tax</dt>
              <dd>{formatMoney(order.tax)}</dd>
            </>
          )}
          <dt>Total</dt>
          <dd>{formatMoney(order.total)}</dd>
        </dl>
      </section>

      <section aria-labelledby="delivery-heading">
        <h2 id="delivery-heading">Delivery</h2>
        <p>
          {statusLabel({
            financialStatus: null,
            fulfillmentStatus: order.fulfillmentStatus,
          })}
        </p>
        {order.fulfillments.length > 0 && (
          <ol aria-label="Shipments">
            {order.fulfillments.map((shipment, index) => (
              <li key={index}>
                <Shipment
                  shipment={shipment}
                  number={index + 1}
                  of={order.fulfillments.length}
                />
              </li>
            ))}
          </ol>
        )}
      </section>

      <Address title="Shipping address" lines={order.shippingAddress} />
      <Address title="Billing address" lines={order.billingAddress} />

      {order.statusPageUrl && (
        <p>
          <a href={order.statusPageUrl}>View this order on Shopify</a>
        </p>
      )}
    </article>
  );
}
