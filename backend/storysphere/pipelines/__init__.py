# ETL pipelines (document processing, feature extraction, KG building)
#
# **Package or module says who drives it.** Every pipeline subclasses
# BasePipeline, but they come in two shapes and the shape is not arbitrary:
#
#   package/     a step of the ingestion run, driven by workflows/ingestion.py
#   module.py    an on-demand orchestrator, driven by a request via api/deps.py
#
# `symbol_discovery/` is the proof that the rule is about the caller and not
# about file count: it holds nothing but `pipeline.py`, yet it is a package
# because ingestion drives it. Read as "someone forgot to flatten it" it looks
# like an accident; read as the rule it is a correct instance.
#
# The distinction was already consistent across all seven pipelines before
# anyone wrote it down (B-118), which is exactly when a convention is most
# likely to be broken by the next person — nothing states it, so nothing
# contradicts them. `tests/pipelines/test_pipeline_shape.py` now does.
#
# Adding one: if ingestion runs it, make it a package; if a request runs it,
# a module. Change the caller and the shape moves with it.
