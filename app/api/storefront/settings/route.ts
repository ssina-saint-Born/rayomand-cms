import { ok } from "@/lib/api";
import { getShopSettings, getDownloadsSettings } from "@/lib/shop/core";
import { getPaymentMethods } from "@/lib/shop/orders";
import { productTerms } from "@/lib/shop/products";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
    const s = (await getShopSettings());
    const som = (await getDownloadsSettings());
    return ok({
        currency: s.currency, currency_pos: s.currency_pos, thousand_sep: s.thousand_sep,
        decimal_sep: s.decimal_sep, num_decimals: s.num_decimals,
        enable_coupons: s.enable_coupons, calc_taxes: s.calc_taxes, tax_rate: s.tax_rate,
        shipping_flat_cost: s.shipping_flat_cost, shipping_free_min: s.shipping_free_min, shipping_pickup: s.shipping_pickup,
        enable_guest_checkout: s.enable_guest_checkout, enable_reviews: s.enable_reviews,
        review_rating_required: s.review_rating_required, shop_columns: s.shop_columns,
        weight_unit: s.weight_unit, dimension_unit: s.dimension_unit, prices_include_tax: s.prices_include_tax,
        disable_ecommerce: som.disable_ecommerce,
        enable_downloads: s.enable_downloads,
        downloads: {
            button_text: som.button_text, link_text: som.link_text, badge_text: som.badge_text, hide_badge: som.hide_badge,
            download_counts: som.download_counts, include_archive_items: som.include_archive_items, hide_readmore: som.hide_readmore, owned_include: som.owned_include,
            show_filename: som.show_filename, file_list_text: som.file_list_text,
            display_single: som.display_single, display_multi: som.display_multi, checkbox_error_text: som.checkbox_error_text,
            button_class: som.button_class, button_css: som.button_css, link_class: som.link_class, link_css: som.link_css,
            capture_email_title: som.capture_email_title, capture_email_title_bg: som.capture_email_title_bg,
            capture_email_title_colour: som.capture_email_title_colour, capture_email_placeholder: som.capture_email_placeholder,
            capture_email_button: som.capture_email_button, capture_email_body: som.capture_email_body,
            capture_email_subscribe: som.capture_email_subscribe, newsletter_enable: som.newsletter_enable,
            docviewer_enable: som.docviewer_enable, docviewer_link_text: som.docviewer_single_link_text,
        },
        payments: await getPaymentMethods(),
        categories: (await productTerms("product_cat")),
        tags: (await productTerms("product_tag")),
    });
}
