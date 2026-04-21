project = "InferencePort AI Docs"
copyright = "2026, Rihaan Meher"
author = "Rihaan Meher"
release = "2.2.0"

extensions = [
    "sphinx.ext.autosectionlabel",
    "sphinx.ext.intersphinx",
    "sphinx.ext.todo",
]

templates_path = ["_templates"]
exclude_patterns = ["_build", "Thumbs.db", ".DS_Store"]

autosectionlabel_prefix_document = True
todo_include_todos = False

intersphinx_mapping = {
    "python": ("https://docs.python.org/3", None),
    "sphinx": ("https://www.sphinx-doc.org/en/master", None),
}

html_theme = "shibuya"
html_title = f"{project} documentation"
html_static_path = ["_static"]
html_context = {
    "source_type": "github",
    "source_user": "sharktide",
    "source_repo": "inferenceport-ai",
    "source_version": "main",
    "source_docs_path": "/docs/source/",
}
html_theme_options = {
    "github_url": "https://github.com/sharktide/inferenceport-ai/",
}
