use html_escape;
use napi_derive::napi;
use pulldown_cmark::{html, Event, Options, Parser, Tag, TagEnd};
use urlencoding::encode;
use std::borrow::Cow;
use svg_hush::{Filter, data_url_filter};
use napi::{Error, Result, Status};
use ammonia::Builder;

#[napi]
pub struct HtmlRenderer;

#[napi]
impl HtmlRenderer {
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

    fn count_run(chars: &[char], start: usize, target: char) -> usize {
        let mut i = start;
        while i < chars.len() && chars[i] == target {
            i += 1;
        }
        i - start
    }

    fn is_escaped_backslash(chars: &[char], idx: usize) -> bool {
        let mut count = 0usize;
        let mut i = idx;
        while i > 0 && chars[i - 1] == '\\' {
            count += 1;
            i -= 1;
        }
        count % 2 == 1
    }

    fn find_closing_delimiter(
        chars: &[char],
        start: usize,
        close: char,
        stop_at_newline: bool,
    ) -> Option<usize> {
        let mut i = start;
        while i + 1 < chars.len() {
            if stop_at_newline && chars[i] == '\n' {
                return None;
            }
            if chars[i] == '\\'
                && !Self::is_escaped_backslash(chars, i)
                && chars[i + 1] == close
            {
                return Some(i);
            }
            i += 1;
        }
        None
    }

    fn normalize_tex_delimiters(input: &str) -> Cow<'_, str> {
        if !input.contains("\\(") && !input.contains("\\[") {
            return Cow::Borrowed(input);
        }
        let chars: Vec<char> = input.chars().collect();
        let mut out = String::with_capacity(input.len());
        let mut changed = false;
        let mut i = 0usize;
        let mut line_start = true;
        let mut in_inline_ticks = 0usize;
        let mut in_fence: Option<(char, usize)> = None;

        while i < chars.len() {
            if let Some((marker, width)) = in_fence {
                if line_start && chars[i] == marker {
                    let run = Self::count_run(&chars, i, marker);
                    if run >= width {
                        for ch in &chars[i..i + run] {
                            out.push(*ch);
                        }
                        i += run;
                        in_fence = None;
                        line_start = false;
                        continue;
                    }
                }
                let ch = chars[i];
                out.push(ch);
                line_start = ch == '\n';
                i += 1;
                continue;
            }

            if in_inline_ticks == 0 && line_start && (chars[i] == '`' || chars[i] == '~') {
                let marker = chars[i];
                let run = Self::count_run(&chars, i, marker);
                if run >= 3 {
                    for ch in &chars[i..i + run] {
                        out.push(*ch);
                    }
                    i += run;
                    in_fence = Some((marker, run));
                    line_start = false;
                    continue;
                }
            }

            if chars[i] == '`' {
                let run = Self::count_run(&chars, i, '`');
                for ch in &chars[i..i + run] {
                    out.push(*ch);
                }
                if in_inline_ticks == 0 {
                    in_inline_ticks = run;
                } else if run == in_inline_ticks {
                    in_inline_ticks = 0;
                }
                i += run;
                line_start = false;
                continue;
            }

            if in_inline_ticks == 0
                && chars[i] == '\\'
                && !Self::is_escaped_backslash(&chars, i)
                && i + 1 < chars.len()
            {
                let open = chars[i + 1];
                if open == '(' || open == '[' {
                    let close = if open == '(' { ')' } else { ']' };
                    let stop_at_newline = open == '(';
                    if let Some(end) = Self::find_closing_delimiter(
                        &chars,
                        i + 2,
                        close,
                        stop_at_newline,
                    ) {
                        out.push_str(if open == '(' { "$" } else { "$$" });
                        for ch in &chars[i + 2..end] {
                            out.push(*ch);
                        }
                        out.push_str(if open == '(' { "$" } else { "$$" });
                        changed = true;
                        i = end + 2;
                        line_start = false;
                        continue;
                    }
                }
            }

            let ch = chars[i];
            out.push(ch);
            line_start = ch == '\n';
            i += 1;
        }

        if changed {
            Cow::Owned(out)
        } else {
            Cow::Borrowed(input)
        }
    }

    fn render_with_custom_html<I>(events: I) -> String
    where
        I: IntoIterator<Item = Event<'static>>,
    {
        let transformed: Vec<Event<'static>> = events
            .into_iter()
            .map(|event| match event {
                Event::Start(Tag::Link { dest_url, title, id, link_type }) => {
                    Event::Html(
                        format!(
                            "<a href=\"{}\"{}>",
                            Self::rewrite_link(&dest_url),
                            if title.is_empty() {
                                String::new()
                            } else {
                                format!(
                                    " title=\"{}\"",
                                    html_escape::encode_double_quoted_attribute(&title)
                                )
                            }
                        )
                        .into(),
                    )
                }

                Event::End(TagEnd::Link) => {
                    Event::Html("</a>".into())
                }

                Event::Code(code) => {
                    Event::Html(
                        format!(
                            "<code>{}</code>",
                            html_escape::encode_text(&code)
                        )
                        .into(),
                    )
                }

                other => other,
            })
            .collect();

        let mut out = String::new();
        html::push_html(&mut out, transformed.into_iter());
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
        let normalized = Self::normalize_tex_delimiters(&input);
        let parser = Parser::new_ext(normalized.as_ref(), Self::build_options());
        let mapped = Self::apply_math_mapping(parser);
        Self::render_with_custom_html(mapped)
    }

    #[napi]
    pub fn sanitize_svg(input: String) -> Result<String> {
        let mut input_bytes = input.as_bytes();
        
        let mut filter = Filter::new();
        filter.set_data_url_filter(data_url_filter::allow_standard_images);
        
        let mut output_bytes = Vec::new();
        
        filter.filter(&mut input_bytes, &mut output_bytes)
            .map_err(|e| Error::new(Status::GenericFailure, format!("SVG sanitization failed: {}", e)))?;
        
        String::from_utf8(output_bytes)
            .map_err(|e| Error::new(Status::GenericFailure, format!("Invalid UTF-8 output: {}", e)))
    }

    #[napi]
    pub fn sanitize_html(input: String) -> String {
        const PREFIX1: &str = r#"javascript:window.utils.web_open('"#;
        const PREFIX2: &str = r#"javascript:window.utils.web_open(""#;
        const SUFFIX1: &str = "')";
        const SUFFIX2: &str = "\")";

        let mut placeholders = Vec::new();
        let mut protected = input.clone();

        while let Some(start) = protected.find(PREFIX1) {
            if let Some(end_rel) = protected[start + PREFIX1.len()..].find(SUFFIX1) {
                let end = start + PREFIX1.len() + end_rel + SUFFIX1.len();

                let original = &protected[start..end];
                let placeholder = format!("_{}_c8ec5caeaccb9964532a_{SAFECALL}_", placeholders.len());

                placeholders.push(original.to_string());

                protected.replace_range(start..end, &placeholder);
            } else {
                break;
            }
        }

        while let Some(start) = protected.find(PREFIX2) {
            if let Some(end_rel) = protected[start + PREFIX2.len()..].find(SUFFIX2) {
                let end = start + PREFIX2.len() + end_rel + SUFFIX2.len();

                let original = &protected[start..end];
                let placeholder = format!("_{}_c8ec5caeaccb9964532a_{SAFECALL}_", placeholders.len());

                placeholders.push(original.to_string());

                protected.replace_range(start..end, &placeholder);
            } else {
                break;
            }
        }

        let sanitized = Builder::new()
            .add_generic_attributes(["data-color", "style", "align"])
            .add_tag_attributes("a", &["href"])
            .add_tag_attributes("details", &["open"])
            .clean(&protected)
            .to_string();

        let mut restored = sanitized;

        for (i, original) in placeholders.iter().enumerate() {
            restored = restored.replace(
                &format!("_{}_c8ec5caeaccb9964532a_{SAFECALL}_", i),
                original,
            );
        }

        restored
    }
}

#[cfg(test)]
mod tests {
    use super::HtmlRenderer;

    #[test]
    fn normalizes_single_backslash_math_delimiters() {
        let input = "Inline \\(a+b\\)\n\\[x^2\\]";
        let normalized = HtmlRenderer::normalize_tex_delimiters(input);
        assert_eq!(normalized.as_ref(), "Inline $a+b$\n$$x^2$$");
    }

    #[test]
    fn keeps_plain_brackets_and_parentheses() {
        let input = "Use (a+b) and [x] normally.";
        let normalized = HtmlRenderer::normalize_tex_delimiters(input);
        assert_eq!(normalized.as_ref(), input);
    }

    #[test]
    fn keeps_escaped_literal_delimiters() {
        let input = "Literal \\\\(not math\\\\) and \\\\[not math\\\\]";
        let normalized = HtmlRenderer::normalize_tex_delimiters(input);
        assert_eq!(normalized.as_ref(), input);
    }

    #[test]
    fn keeps_code_spans_literal() {
        let input = "`\\(x\\)` and `\\[y\\]`";
        let normalized = HtmlRenderer::normalize_tex_delimiters(input);
        assert_eq!(normalized.as_ref(), input);
    }

    #[test]
    fn keeps_unclosed_delimiters_literal() {
        let input = "Start \\(x+1 without close";
        let normalized = HtmlRenderer::normalize_tex_delimiters(input);
        assert_eq!(normalized.as_ref(), input);
    }
}
