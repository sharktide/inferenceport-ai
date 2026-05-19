use napi_derive::napi;

use html_escape::encode_safe;

use pulldown_cmark::{
    CodeBlockKind,
    Event,
    HeadingLevel,
    Options,
    Parser,
    Tag,
    TagEnd,
};

#[napi]
pub fn render_markdown(input: String) -> String {
    let mut options = Options::empty();

    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_FOOTNOTES);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_TASKLISTS);
    options.insert(Options::ENABLE_HEADING_ATTRIBUTES);
    options.insert(Options::ENABLE_MATH);

    let parser = Parser::new_ext(&input, options);

    let mut out = String::new();

    for event in parser {
        match event {
            Event::Start(tag) => {
                push_start_tag(&mut out, tag);
            }

            Event::End(tag) => {
                push_end_tag(&mut out, tag);
            }

            Event::Text(text) => {
                out.push_str(&encode_safe(&text));
            }

            Event::Code(code) => {
                out.push_str("<code>");
                out.push_str(&encode_safe(&code));
                out.push_str("</code>");
            }

            Event::Html(html) | Event::InlineHtml(html) => {
                out.push_str(&html);
            }

            Event::SoftBreak => {
                out.push('\n');
            }

            Event::HardBreak => {
                out.push_str("<br />\n");
            }

            Event::Rule => {
                out.push_str("<hr />");
            }

            Event::InlineMath(tex) => {
                out.push_str(r"\(");
                out.push_str(&tex);
                out.push_str(r"\)");
            }

            Event::DisplayMath(tex) => {
                out.push_str(r"\[");
                out.push_str(&tex);
                out.push_str(r"\]");
            }

            Event::FootnoteReference(name) => {
                out.push_str("<sup>");
                out.push_str(&encode_safe(&name));
                out.push_str("</sup>");
            }

            Event::TaskListMarker(checked) => {
                if checked {
                    out.push_str(
                        r#"<input type="checkbox" checked disabled />"#,
                    );
                } else {
                    out.push_str(
                        r#"<input type="checkbox" disabled />"#,
                    );
                }
            }
        }
    }

    out
}

fn push_start_tag(out: &mut String, tag: Tag<'_>) {
    match tag {
        Tag::Paragraph => {
            out.push_str("<p>");
        }

        Tag::Heading { level, .. } => {
            out.push('<');
            out.push_str(heading_level(level));
            out.push('>');
        }

        Tag::BlockQuote(_) => {
            out.push_str("<blockquote>");
        }

        Tag::CodeBlock(kind) => {
            out.push_str("<pre><code");

            match kind {
                CodeBlockKind::Indented => {}

                CodeBlockKind::Fenced(lang) => {
                    if !lang.is_empty() {
                        out.push_str(r#" class="language-"#);
                        out.push_str(&encode_safe(&lang));
                        out.push('"');
                    }
                }
            }

            out.push('>');
        }

        Tag::List(Some(start)) => {
            out.push_str(&format!(r#"<ol start="{}">"#, start));
        }

        Tag::List(None) => {
            out.push_str("<ul>");
        }

        Tag::Item => {
            out.push_str("<li>");
        }

        Tag::Emphasis => {
            out.push_str("<em>");
        }

        Tag::Strong => {
            out.push_str("<strong>");
        }

        Tag::Strikethrough => {
            out.push_str("<del>");
        }

        Tag::Link {
            dest_url,
            title,
            ..
        } => {
            out.push_str(r#"<a href=""#);
            out.push_str(&encode_safe(&dest_url));
            out.push('"');

            if !title.is_empty() {
                out.push_str(r#" title=""#);
                out.push_str(&encode_safe(&title));
                out.push('"');
            }

            out.push('>');
        }

        Tag::Image {
            dest_url,
            title,
            ..
        } => {
            out.push_str(r#"<img src=""#);
            out.push_str(&encode_safe(&dest_url));
            out.push('"');

            if !title.is_empty() {
                out.push_str(r#" title=""#);
                out.push_str(&encode_safe(&title));
                out.push('"');
            }

            out.push_str(" />");
        }

        Tag::Table(_) => {
            out.push_str("<table>");
        }

        Tag::TableHead => {
            out.push_str("<thead>");
        }

        Tag::TableRow => {
            out.push_str("<tr>");
        }

        Tag::TableCell => {
            out.push_str("<td>");
        }

        _ => {}
    }
}

fn push_end_tag(out: &mut String, tag: TagEnd) {
    match tag {
        TagEnd::Paragraph => {
            out.push_str("</p>");
        }

        TagEnd::Heading(level) => {
            out.push_str("</");
            out.push_str(heading_level(level));
            out.push('>');
        }

        TagEnd::BlockQuote(_) => {
            out.push_str("</blockquote>");
        }

        TagEnd::CodeBlock => {
            out.push_str("</code></pre>");
        }

        TagEnd::List(true) => {
            out.push_str("</ol>");
        }

        TagEnd::List(false) => {
            out.push_str("</ul>");
        }

        TagEnd::Item => {
            out.push_str("</li>");
        }

        TagEnd::Emphasis => {
            out.push_str("</em>");
        }

        TagEnd::Strong => {
            out.push_str("</strong>");
        }

        TagEnd::Strikethrough => {
            out.push_str("</del>");
        }

        TagEnd::Link => {
            out.push_str("</a>");
        }

        TagEnd::Table => {
            out.push_str("</table>");
        }

        TagEnd::TableHead => {
            out.push_str("</thead>");
        }

        TagEnd::TableRow => {
            out.push_str("</tr>");
        }

        TagEnd::TableCell => {
            out.push_str("</td>");
        }

        _ => {}
    }
}

fn heading_level(level: HeadingLevel) -> &'static str {
    match level {
        HeadingLevel::H1 => "h1",
        HeadingLevel::H2 => "h2",
        HeadingLevel::H3 => "h3",
        HeadingLevel::H4 => "h4",
        HeadingLevel::H5 => "h5",
        HeadingLevel::H6 => "h6",
    }
}