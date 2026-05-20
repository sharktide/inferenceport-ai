use napi_derive::napi;

use pulldown_cmark::{
    html,
    Options,
    Parser,
    Event,
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

    html::push_html(&mut out, parser);

    out
}

#[napi]
pub fn render_md_tex(input: String) -> String {
    let mut options = Options::empty();

    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_FOOTNOTES);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_TASKLISTS);
    options.insert(Options::ENABLE_HEADING_ATTRIBUTES);
    options.insert(Options::ENABLE_MATH);

    let parser = Parser::new_ext(&input, options);

    let mapped = parser.map(|event| match event {
        Event::InlineMath(tex) => {
            // KaTeX auto-render inline delimiter
            Event::Text(format!("\\({}\\)", tex).into())
        }

        Event::DisplayMath(tex) => {
            // KaTeX auto-render block delimiter
            Event::Text(format!("\n$$\n{}\n$$\n", tex).into())
        }

        other => other,
    });

    let mut out = String::new();
    html::push_html(&mut out, mapped);

    out
}