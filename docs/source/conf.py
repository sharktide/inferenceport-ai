project = "InferencePort AI"
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

html_theme = "furo"
html_title = f"{project} documentation"
html_static_path = ["_static"]
html_theme_options = {
    "source_repository": "https://github.com/sharktide/inferenceport-ai/",
    "source_branch": "main",
    "source_directory": "docs/source/",
    "collapse_navigation": False,
    "navigation_depth": 4,
}
