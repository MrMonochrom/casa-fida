Feature: Finding a builder
  Clients compare builders by their reviews and past work, then message them or post a job.

  Scenario: Every builder with a profile, best rated first
    Given I am logged in as Noah
    When I open "Find builders" in the menu
    Then I see "6 builders"
    And the builders are listed in this order:
      | Becker Roofing           |
      | Shah Kitchen & Bath      |
      | Whitfield Electric       |
      | Reid & Sons Construction |
      | Ortiz Outdoor Living     |
      | Kim Renovation Co.       |

  Scenario: Searching by name
    Given I am logged in as Noah
    When I open "Find builders" in the menu
    And I search for "Shah"
    Then I see "1 builder"
    And the builders are listed in this order:
      | Shah Kitchen & Bath |

  Scenario: Searching by area
    Given I am logged in as Noah
    When I open "Find builders" in the menu
    And I search for "Denver"
    Then the builders are listed in this order:
      | Whitfield Electric       |
      | Reid & Sons Construction |

  Scenario: Filtering by trade
    Given I am logged in as Noah
    When I open "Find builders" in the menu
    And I choose "Roofing" for "Trade"
    Then the builders are listed in this order:
      | Becker Roofing |

  Scenario: Nobody matches
    Given I am logged in as Noah
    When I open "Find builders" in the menu
    And I search for "Zanzibar"
    Then I see "No builders match that search."

  Scenario: A builder's profile
    Given I am logged in as Noah
    When I open "Find builders" in the menu
    And I open the builder "Reid & Sons Construction"
    Then I see the heading "Reid & Sons Construction"
    And I see "Family-run general contractor for new homes, additions and whole-home remodels."
    And I see "Licensed"
    And I see "Insured"
    And I see "18 yrs in business"
    And I see "2 projects on Casa Fida"
    And I see "GC-48213"
    And I see a review by "Olivia B. · Two-story addition" saying "Great quality and communication."

  Scenario: Messaging a builder from their profile
    Given I am logged in as Noah
    When I open "Find builders" in the menu
    And I open the builder "Becker Roofing"
    And I click "Message Tom"
    Then I am in the conversation with "Becker Roofing"
    And I see "Say hello to Tom."

  Scenario: A builder looking at their own profile
    Given I am logged in as Marcus
    When I go to "/builders/1"
    Then I see the heading "Reid & Sons Construction"
    And I see the link "Edit your profile"
    And I don't see "Message Marcus"
