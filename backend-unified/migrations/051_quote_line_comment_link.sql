-- Quotation lines get a short comment (printed small under the item) and a
-- product link; catalog items carry a product link that is copied onto the
-- line when the item is added, like the other item fields.

ALTER TABLE quote_items
  ADD COLUMN product_link text;

ALTER TABLE quote_lines
  ADD COLUMN comment text,
  ADD COLUMN product_link text;
