"""Evidence content models, one per claim type (docs/spec/01 §5–§7)."""

from storysphere.domain.evidence.anachrony import AnachronyContent
from storysphere.domain.evidence.arc_segment import ArcSegmentContent
from storysphere.domain.evidence.archetype import ArchetypeContent
from storysphere.domain.evidence.base import ContentPart, EvidenceContent
from storysphere.domain.evidence.belief_state import BeliefStateContent
from storysphere.domain.evidence.book_setting import BookSettingContent
from storysphere.domain.evidence.causal_link import CausalLinkContent
from storysphere.domain.evidence.character import CharacterContent
from storysphere.domain.evidence.clue_points_to import CluePointsToContent
from storysphere.domain.evidence.event import EventContent
from storysphere.domain.evidence.event_impact import EventImpactContent
from storysphere.domain.evidence.event_role import EventRoleContent
from storysphere.domain.evidence.fairness_gap import FairnessGapContent
from storysphere.domain.evidence.focalization import FocalizationContent
from storysphere.domain.evidence.focalization_pattern import FocalizationPatternContent
from storysphere.domain.evidence.genre_ext import (
    GENRE_EXT_MODELS,
    MysteryCharacterExt,
    MysteryHiddenTruthExt,
)
from storysphere.domain.evidence.hidden_truth import HiddenTruthContent
from storysphere.domain.evidence.imagery_motif import ImageryMotifContent
from storysphere.domain.evidence.interpretation import InterpretationContent
from storysphere.domain.evidence.journey_stage import JourneyStageContent
from storysphere.domain.evidence.note import NoteContent
from storysphere.domain.evidence.opposition import OppositionContent
from storysphere.domain.evidence.puzzle_type import PuzzleTypeContent
from storysphere.domain.evidence.relation_network import RelationNetworkContent
from storysphere.domain.evidence.relation_state import RelationStateContent
from storysphere.domain.evidence.reveal import RevealContent
from storysphere.domain.evidence.suspect_matrix import SuspectMatrixContent
from storysphere.domain.evidence.symbol_reading import SymbolReadingContent
from storysphere.domain.evidence.tension_line import TensionLineContent
from storysphere.domain.evidence.theme_reading import ThemeReadingContent
from storysphere.domain.evidence.trick import TrickContent
from storysphere.domain.evidence.trick_class import TrickClassContent
from storysphere.domain.evidence.two_story_map import TwoStoryMapContent
from storysphere.domain.evidence.utterance import UtteranceContent
from storysphere.domain.evidence.voice_profile import VoiceProfileContent

# 明確列出，不做動態掃描；順序同 docs/spec/01 §6.1–§6.4、§5
_CONTENT_CLASSES: tuple[type[EvidenceContent], ...] = (
    CharacterContent,
    EventContent,
    RelationStateContent,
    UtteranceContent,
    ImageryMotifContent,
    FocalizationContent,
    BookSettingContent,
    HiddenTruthContent,
    RevealContent,
    CluePointsToContent,
    TrickContent,
    CausalLinkContent,
    ArchetypeContent,
    ArcSegmentContent,
    VoiceProfileContent,
    RelationNetworkContent,
    BeliefStateContent,
    AnachronyContent,
    FocalizationPatternContent,
    OppositionContent,
    SymbolReadingContent,
    EventRoleContent,
    EventImpactContent,
    TensionLineContent,
    JourneyStageContent,
    ThemeReadingContent,
    TrickClassContent,
    FairnessGapContent,
    SuspectMatrixContent,
    TwoStoryMapContent,
    PuzzleTypeContent,
    NoteContent,
    InterpretationContent,
)

CONTENT_MODELS: dict[str, type[EvidenceContent]] = {
    cls.claim_type: cls for cls in _CONTENT_CLASSES
}

__all__ = [
    "CONTENT_MODELS",
    "GENRE_EXT_MODELS",
    "ContentPart",
    "EvidenceContent",
    "MysteryCharacterExt",
    "MysteryHiddenTruthExt",
]
