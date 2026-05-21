use html_escape;
use napi_derive::napi;
use pulldown_cmark::{html, Event, Options, Parser, Tag, TagEnd};
use urlencoding::encode;

#[napi]
pub struct MarkdownRenderer;

#[napi]
impl MarkdownRenderer {
    fn build_options() -> Options {
        let mut options = Options::empty();
        options.insert(Options::ENABLE_TABLES);
        options.insert(Options::ENABLE_FOOTNOTES);
        options.insert(Options::ENABLE_STRIKETHROUGH);
        options.insert(Options::ENABLE_TASKLISTS);
        options.insert(Options::ENABLE_HEADING_ATTRIBUTES);
        options.insert(Options::ENABLE_MATH);
        options
    }

    fn rewrite_link(href: &str) -> String {
        format!("javascript:window.utils.web_open('{}')", encode(href))
    }

    fn render_with_custom_html<I>(events: I) -> String
    where
        I: IntoIterator<Item = Event<'static>>,
    {
        let mut out = String::new();

        for event in events {
            match event {
                Event::Start(Tag::Link { dest_url, title, .. }) => {
                    out.push_str("<a href=\"");
                    out.push_str(&Self::rewrite_link(&dest_url));
                    out.push('"');

                    if !title.is_empty() {
                        out.push_str(" title=\"");
                        out.push_str(&html_escape::encode_double_quoted_attribute(&title));
                        out.push('"');
                    }

                    out.push('>');
                }

                Event::End(TagEnd::Link { .. }) => {
                    out.push_str("</a>");
                }

                Event::Code(code) => {
                    out.push_str("<code>");
                    out.push_str(&html_escape::encode_text(&code));
                    out.push_str("</code>");
                }

                Event::Html(html_raw) => {
                    out.push_str(&html_raw);
                }

                Event::Text(text) => {
                    out.push_str(&html_escape::encode_text(&text));
                }

                other => {
                    html::push_html(&mut out, std::iter::once(other));
                }
            }
        }

        out
    }

    fn apply_math_mapping<'input>(
        parser: Parser<'input>,
    ) -> impl Iterator<Item = Event<'static>> {
        parser
            .map(|event| match event {
                Event::InlineMath(tex) => {
                    Event::Text(format!("\\({}\\)", tex).into())
                }
                Event::DisplayMath(tex) => {
                    Event::Text(format!("\n$$\n{}\n$$\n", tex).into())
                }
                other => other,
            })
            .map(|e| e.into_static())
    }

    #[napi]
    pub fn render_markdown(input: String) -> String {
        let parser = Parser::new_ext(&input, Self::build_options());
        let events = parser.map(|e| e.into_static());
        Self::render_with_custom_html(events)
    }

    #[napi]
    pub fn render_md_tex(input: String) -> String {
        let parser = Parser::new_ext(&input, Self::build_options());
        let mapped = Self::apply_math_mapping(parser);
        Self::render_with_custom_html(mapped)
    }
}
