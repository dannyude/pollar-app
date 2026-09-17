import pytest

from app.domain.rails import institution, validate_details

from .factories import error_of


def test_bank_details_are_trimmed_and_stored_camel_cased():
    raw = {"bank": " GTBank ", "accountNumber": "0123456789", "accountName": "Ada Obi"}
    assert validate_details("bank_transfer", raw, "payout") == {"bank": "GTBank", "accountNumber": "0123456789", "accountName": "Ada Obi"}


def test_invalid_details_name_the_field_that_needs_fixing():
    error = error_of(validate_details, "bank_transfer", {"bank": "GTBank", "accountName": "Ada Obi"}, "payout")
    assert error.code == "VALIDATION_ERROR"
    assert [d["path"] for d in error.details] == ["payout.accountNumber"]


def test_mobile_money_needs_a_real_phone_number():
    raw = {"provider": "MTN MoMo", "phoneNumber": "call me", "accountName": "Kofi Mensah"}
    assert [d["path"] for d in error_of(validate_details, "mobile_money", raw, "payout").details] == ["payout.phoneNumber"]


def test_public_listings_show_the_institution_never_the_account():
    assert institution("bank_transfer", {"bank": "GTBank", "accountNumber": "0123456789"}) == "GTBank"
    assert institution("mobile_money", {"provider": "MTN MoMo", "phoneNumber": "+233 24 000 0000"}) == "MTN MoMo"
    assert institution("cash", {"location": "Yaba market"}) == "Cash"


def test_an_unknown_rail_is_a_programming_error():
    with pytest.raises(ValueError):
        validate_details("carrier_pigeon", {}, "payout")
