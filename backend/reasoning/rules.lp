% ─── TwinTrack ASP Decision Engine — rules.lp ───────────────────────────────

% Facts expected at runtime:
% profit_delta(N)
% confidence(N)
% margin_pct(N)
% margin_drop_pp(N)
% break_even_months(N)
% use_case(uc)

% ─── Derived signals ────────────────────────────────────────────────────────

profit_improving :- profit_delta(D), D > 0.
profit_declining :- profit_delta(D), D < 0.

confidence_high     :- confidence(C), C >= 65.
confidence_moderate :- confidence(C), C >= 45, C < 65.
confidence_low      :- confidence(C), C < 45.

margin_healthy  :- margin_pct(M), M >= 15.
margin_thin     :- margin_pct(M), M >= 10, M < 15.
margin_critical :- margin_pct(M), M < 10.

margin_drop_significant :- margin_drop_pp(D), D > 5.

break_even_na          :- break_even_months(999).
break_even_acceptable  :- break_even_months(B), B =< 24, not break_even_na.
break_even_stretched   :- break_even_months(B), B > 24, B =< 48.
break_even_infeasible  :- break_even_months(B), B > 48, B < 999.

% ─── Strong positive case ───────────────────────────────────────────────────

strong_case :-
    profit_improving,
    margin_healthy,
    confidence_high,
    break_even_acceptable.

% ─── Hard disqualifiers ─────────────────────────────────────────────────────

disqualified :- margin_critical.
disqualified :- confidence_low.
disqualified :- break_even_infeasible.

% Contextual disqualification
disqualified :-
    margin_drop_significant,
    margin_thin.

disqualified :-
    profit_declining,
    not (margin_healthy, confidence_high).

% Pricing should not take long to pay off
disqualified :-
    use_case(pricing),
    break_even_stretched.

% ─── Warning signals ────────────────────────────────────────────────────────

warning_flag(confidence_moderate) :- confidence_moderate.
warning_flag(margin_thin)         :- margin_thin.
warning_flag(break_even_stretched) :- break_even_stretched.
warning_flag(profit_declining)    :- profit_declining.
warning_flag(margin_drop_significant) :- margin_drop_significant.

% Count warnings (need >= 2 to trigger caution)
warned :-
    not disqualified,
    N = #count { X : warning_flag(X) },
    N >= 2.

% ─── Final verdict ──────────────────────────────────────────────────────────

verdict(do_not_proceed) :- disqualified.
verdict(proceed)        :- strong_case, not disqualified.
verdict(caution)        :- warned, not disqualified.
verdict(proceed)        :- not disqualified, not warned, not strong_case.

% ─── Reasons (explainability) ───────────────────────────────────────────────

reason(profit_improving)        :- profit_improving.
reason(profit_declining)        :- profit_declining.
reason(confidence_high)         :- confidence_high.
reason(confidence_moderate)     :- confidence_moderate.
reason(confidence_low)          :- confidence_low.
reason(margin_healthy)          :- margin_healthy.
reason(margin_thin)             :- margin_thin.
reason(margin_critical)         :- margin_critical.
reason(margin_drop_significant) :- margin_drop_significant.
reason(break_even_acceptable)   :- break_even_acceptable.
reason(break_even_stretched)    :- break_even_stretched.
reason(break_even_infeasible)   :- break_even_infeasible.
reason(strong_case)             :- strong_case.

#show verdict/1.
#show reason/1.